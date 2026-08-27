import { PCBGraph, ERCResult, ComponentInstance, Net } from './types';

/**
 * Deterministic Real-Time Electrical Rules Check (ERC) Engine
 */
export function runElectricalRulesCheck(graph: PCBGraph): ERCResult[] {
  const results: ERCResult[] = [];
  const compMap = new Map<string, ComponentInstance>();
  graph.components.forEach((c) => compMap.set(c.id, c));

  // 1. Check Power Short Circuits (e.g. GND connected to +3V3 or VBUS)
  const gndNet = graph.nets.find((n) => n.id.toUpperCase() === 'GND' || n.name.toUpperCase() === 'GND');
  const powerNets = graph.nets.filter(
    (n) => n.netClass === 'power' && n.id.toUpperCase() !== 'GND' && n.name.toUpperCase() !== 'GND'
  );

  if (gndNet) {
    powerNets.forEach((pNet) => {
      const gndPins = new Set(gndNet.connections.map((c) => `${c.componentId}:${c.pinNumber}`));
      const overlappingPins = pNet.connections.filter((c) => gndPins.has(`${c.componentId}:${c.pinNumber}`));
      if (overlappingPins.length > 0) {
        results.push({
          id: `erc-short-${pNet.id}-GND`,
          severity: 'error',
          category: 'power',
          title: `Direct Power Short Detected: ${pNet.name} shorted to GND`,
          message: `Pins ${overlappingPins.map((p) => `${p.componentId}.${p.pinNumber}`).join(', ')} are tied to both ${pNet.name} and GND. This will destroy the board!`,
          affectedComponents: overlappingPins.map((p) => p.componentId),
          affectedNets: [pNet.id, gndNet.id],
          suggestedFix: 'Disconnect the shorted pin from GND or power net.',
        });
      }
    });
  }

  // 2. Check I2C Pull-Up Resistors on Open-Drain Buses
  const i2cNets = graph.nets.filter(
    (n) =>
      n.netClass === 'i2c' ||
      n.name.toUpperCase().includes('SDA') ||
      n.name.toUpperCase().includes('SCL') ||
      n.properties?.pullUpRequired
  );

  i2cNets.forEach((net) => {
    // Check if any resistor is connected to this net
    const connectedResistors = net.connections.filter((ep) => {
      const comp = compMap.get(ep.componentId);
      return comp && (comp.category === 'Passive' || comp.id.startsWith('R') || comp.package.includes('0402') || comp.package.includes('0603'));
    });

    if (connectedResistors.length === 0) {
      results.push({
        id: `erc-missing-pullup-${net.id}`,
        severity: 'warning',
        category: 'pullup',
        title: `Missing Pull-Up Resistor on ${net.name}`,
        message: `I2C bus line ${net.name} is open-drain and requires a pull-up resistor (typically 2.2k - 4.7kΩ to 3.3V) for signal rise-time compliance.`,
        affectedNets: [net.id],
        suggestedFix: `Add a 4.7k resistor between ${net.name} and the +3.3V rail.`,
      });
    }
  });

  // 3. Check Floating Power Pins on ICs
  graph.components.forEach((comp) => {
    comp.pins.forEach((pin) => {
      if (pin.type === 'power_in' && !pin.connectedNet) {
        results.push({
          id: `erc-floating-power-${comp.id}-${pin.number}`,
          severity: 'error',
          category: 'floating',
          title: `Floating Power Pin: ${comp.id} pin ${pin.number} (${pin.name})`,
          message: `Power input pin ${pin.name} on ${comp.name} (${comp.id}) is unconnected.`,
          affectedComponents: [comp.id],
          suggestedFix: `Connect ${comp.id}.${pin.number} to the appropriate power or ground net.`,
        });
      }
    });
  });

  // 4. Check Decoupling Capacitance on High-Speed ICs
  const mcuComps = graph.components.filter((c) => c.category === 'MCU' || c.category === 'Sensor');
  mcuComps.forEach((mcu) => {
    const powerPins = mcu.pins.filter((p) => p.type === 'power_in' && p.connectedNet && p.connectedNet.toUpperCase() !== 'GND');
    powerPins.forEach((pPin) => {
      const net = graph.nets.find((n) => n.id === pPin.connectedNet);
      if (net) {
        const hasDecouplingCap = net.connections.some((ep) => {
          const comp = compMap.get(ep.componentId);
          return comp && (comp.category === 'Passive' || comp.id.startsWith('C') || comp.name.toLowerCase().includes('cap'));
        });
        if (!hasDecouplingCap) {
          results.push({
            id: `erc-decoupling-${mcu.id}-${pPin.number}`,
            severity: 'warning',
            category: 'decoupling',
            title: `Insufficient Decoupling on ${mcu.id} (${pPin.name})`,
            message: `${mcu.name} power rail pin ${pPin.name} lacks local bypass/decoupling capacitors (100nF recommended).`,
            affectedComponents: [mcu.id],
            affectedNets: [net.id],
            suggestedFix: `Place a 100nF ceramic capacitor adjacent to ${mcu.id}.${pPin.number} to GND.`,
          });
        }
      }
    });
  });

  // 5. Check Differential Pair Matching (e.g. USB DP / DM)
  const diffPosNets = graph.nets.filter((n) => n.netClass === 'diff_pair_pos' || n.name.endsWith('_DP') || n.name.endsWith('_P'));
  diffPosNets.forEach((posNet) => {
    const expectedNegName = posNet.name.replace(/_DP$/, '_DM').replace(/_P$/, '_N');
    const negNet = graph.nets.find((n) => n.name === expectedNegName || n.id === posNet.properties?.diffPairMatch);
    if (!negNet) {
      results.push({
        id: `erc-diff-pair-${posNet.id}`,
        severity: 'info',
        category: 'pin_conflict',
        title: `Unpaired Differential Net: ${posNet.name}`,
        message: `Differential signal ${posNet.name} has no complementary negative net (${expectedNegName}) configured.`,
        affectedNets: [posNet.id],
        suggestedFix: `Ensure complementary net ${expectedNegName} is routed in parallel with 90Ω differential impedance.`,
      });
    }
  });

  return results;
}
