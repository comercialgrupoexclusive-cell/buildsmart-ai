import { describe, expect, it } from 'vitest';
import { computeNewEndpoint } from '../WallGeometry';

describe('computeNewEndpoint', () => {
  it('extends a horizontal wall while keeping the fixed endpoint in place', () => {
    const fixed = { x: 0, y: 0 };
    const moving = { x: 240, y: 0 }; // 2.40m wall at METER=100
    const result = computeNewEndpoint(fixed, moving, 300); // -> 3.00m
    expect(result.x).toBeCloseTo(300);
    expect(result.y).toBeCloseTo(0);
  });

  it('shrinks a horizontal wall while keeping the fixed endpoint in place', () => {
    const fixed = { x: 0, y: 0 };
    const moving = { x: 300, y: 0 };
    const result = computeNewEndpoint(fixed, moving, 100);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(0);
  });

  it('preserves direction on a vertical wall', () => {
    const fixed = { x: 50, y: 50 };
    const moving = { x: 50, y: 250 }; // going +y
    const result = computeNewEndpoint(fixed, moving, 400);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(450);
  });

  it('preserves the exact angle on a diagonal wall', () => {
    const fixed = { x: 0, y: 0 };
    const moving = { x: 300, y: 400 }; // 3-4-5 triangle, length 500
    const result = computeNewEndpoint(fixed, moving, 1000);
    expect(result.x).toBeCloseTo(600);
    expect(result.y).toBeCloseTo(800);
  });

  it('moves the endpoint back toward the fixed point when the direction is negative', () => {
    const fixed = { x: 500, y: 500 };
    const moving = { x: 200, y: 500 }; // going -x
    const result = computeNewEndpoint(fixed, moving, 600);
    expect(result.x).toBeCloseTo(-100);
    expect(result.y).toBeCloseTo(500);
  });

  it('leaves the moving point unchanged for a degenerate zero-length wall', () => {
    const fixed = { x: 10, y: 10 };
    const moving = { x: 10, y: 10 };
    const result = computeNewEndpoint(fixed, moving, 300);
    expect(result).toEqual({ x: 10, y: 10 });
  });

  it('never moves the fixed endpoint itself', () => {
    const fixed = { x: 123, y: 456 };
    const moving = { x: 200, y: 456 };
    computeNewEndpoint(fixed, moving, 999);
    expect(fixed).toEqual({ x: 123, y: 456 });
  });
});
