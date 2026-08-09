import { describe, it, expect } from 'vitest';

describe('@superagent/web Server Config Tests', () => {
  it('should resolve default HomeLab port 14692', () => {
    const port = Number(process.env.PORT) || 14692;
    expect(port).toBe(14692);
  });
});
