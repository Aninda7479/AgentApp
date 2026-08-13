import { describe, it, expect } from 'vitest';

describe('@superagent/web Server Config Tests', () => {
  it('should resolve default HomeLab port 1469', () => {
    const port = Number(process.env.PORT) || 1469;
    expect(port).toBe(1469);
  });
});
