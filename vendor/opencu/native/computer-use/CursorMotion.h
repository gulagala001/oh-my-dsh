#pragma once
#import <AppKit/AppKit.h>
#include <math.h>

typedef struct { CGPoint start, control1, control2, end; } CUCursorCubic;
typedef struct { CUCursorCubic segments[2]; NSUInteger count; BOOL arc; } CUCursorPath;
typedef struct { double length, energy, maximumTurn, totalTurn; BOOL inBounds; } CUCursorPathMetrics;
typedef struct {
  double clickAngle;
  int64_t candidates;
  double boundsMargin, startHandle, endHandle, arcSize, arcFlow, straightThreshold;
  double responseMultiplier, minimumResponse, maximumResponse, pathDamping, scootThreshold;
  double positionResponse, positionDamping, positionTolerance, axisResponse, axisDamping;
  double baseRotationResponse, baseRotationDamping, stretchResponse, stretchDamping;
  double stretchScale, stretchPivot, stretchAmount, stretchCompression;
  double rotationResponse, rotationDamping, maximumRotation, directionProgress;
} CUCursorMotionConfiguration;
_Static_assert(sizeof(CUCursorMotionConfiguration) == 240, "Native cursor configuration must retain its source layout.");

// Original MotionConfiguration initializer 0x1000922fc, copied by 0x1000714f8.
static const CUCursorMotionConfiguration CUCursorMotionDefaults = {
  -44, 20, 20, .41960295031576633, .15, .2765523188064277, .5783555327868779, 10,
  .9, .12, 2.2, .9, 196, .24, .84, 12, .07, .82, .09, .86, .095, .72,
  0, .5, .38, .18, .055, .76, 76, .99
};
static inline double CUCursorClamp(double x, double lower, double upper) { return fmin(upper, fmax(lower, x)); }
static inline CGPoint CUCursorAdd(CGPoint a, CGPoint b) { return CGPointMake(a.x + b.x, a.y + b.y); }
static inline CGPoint CUCursorSubtract(CGPoint a, CGPoint b) { return CGPointMake(a.x - b.x, a.y - b.y); }
static inline CGPoint CUCursorMultiply(CGPoint a, double k) { return CGPointMake(a.x * k, a.y * k); }
static inline CGPoint CUCursorNormalize(CGPoint a) {
  double length = hypot(a.x, a.y);
  return length < .001 ? CGPointMake(1, 0) : CUCursorMultiply(a, 1 / length);
}
static inline double CUCursorWrap(double value, double limit) {
  while (value > limit) value -= 2 * limit;
  while (value < -limit) value += 2 * limit;
  return value;
}
static inline CGPoint CUCursorClickDirection(void) {
  double angle = CUCursorMotionDefaults.clickAngle * M_PI / 180;
  return CGPointMake(sin(angle), cos(angle));
}
static inline CGPoint CUCursorCubicPoint(CUCursorCubic c, double t) {
  double u = 1 - t;
  return CUCursorAdd(CUCursorAdd(CUCursorMultiply(c.start, u*u*u), CUCursorMultiply(c.control1, 3*t*u*u)),
    CUCursorAdd(CUCursorMultiply(c.control2, 3*t*t*u), CUCursorMultiply(c.end, t*t*t)));
}
static inline CGPoint CUCursorCubicDerivative(CUCursorCubic c, double t) {
  double u = 1 - t;
  return CUCursorAdd(CUCursorAdd(CUCursorMultiply(CUCursorSubtract(c.control1, c.start), 3*u*u),
    CUCursorMultiply(CUCursorSubtract(c.control2, c.control1), 6*u*t)), CUCursorMultiply(CUCursorSubtract(c.end, c.control2), 3*t*t));
}
// Original metric body 0x10009b2f0 samples each segment exactly 24 times.
static inline CUCursorPathMetrics CUCursorMeasurePath(CUCursorPath path, CGRect bounds) {
  CGRect inset = CGRectInset(bounds, CUCursorMotionDefaults.boundsMargin, CUCursorMotionDefaults.boundsMargin);
  CUCursorPathMetrics m = {0, 0, 0, 0, CGRectContainsPoint(inset, path.segments[0].start)};
  CGPoint previous = path.segments[0].start;
  double angle = 0; BOOL hasAngle = NO;
  for (NSUInteger s = 0; s < path.count; s++) for (NSUInteger i = 1; i <= 24; i++) {
    CGPoint point = CUCursorCubicPoint(path.segments[s], i / 24.0), step = CUCursorSubtract(point, previous);
    double length = hypot(step.x, step.y); m.length += length;
    m.inBounds = m.inBounds && CGRectContainsPoint(inset, point);
    if (length > .01) {
      double nextAngle = atan2(step.y, step.x);
      if (hasAngle) {
        double turn = CUCursorWrap(nextAngle - angle, M_PI);
        m.energy += turn * turn; m.maximumTurn = fmax(m.maximumTurn, fabs(turn)); m.totalTurn += fabs(turn);
      }
      angle = nextAngle; hasAngle = YES;
    }
    previous = point;
  }
  return m;
}
static inline double CUCursorDirectionPenalty(CGPoint start, CGPoint end) {
  CGPoint direction = CUCursorNormalize(CUCursorSubtract(end, start)), click = CUCursorClickDirection();
  return CUCursorClamp((-.08 - direction.x * click.x - direction.y * click.y) / .92, 0, 1);
}
// Original generator 0x10009ff00. Native controls are not browser bounds-clamped.
static inline NSUInteger CUCursorGeneratePaths(CGPoint start, CGPoint end, CUCursorPath paths[20]) {
  CGPoint delta = CUCursorSubtract(end, start), direction = CUCursorNormalize(delta), click = CUCursorClickDirection();
  double length = hypot(delta.x, delta.y);
  double h1 = fmax(48, fmin(640, fmin(length * .9, length * CUCursorMotionDefaults.startHandle)));
  double h2 = fmax(48, fmin(640, fmin(length * .9, length * CUCursorMotionDefaults.endHandle)));
  NSUInteger count = 0;
  const double handles[2] = {1, .65};
  for (NSUInteger i = 0; i < 2; i++) {
    CUCursorCubic cubic = {start, CUCursorAdd(start, CUCursorMultiply(click, h1 * handles[i])), CUCursorSubtract(end, CUCursorMultiply(click, h2 * handles[i])), end};
    paths[count++] = (CUCursorPath){{cubic}, 1, NO};
  }
  CGPoint normal = CGPointMake(-direction.y, direction.x);
  if (normal.x * click.x + normal.y * click.y < 0) normal = CUCursorMultiply(normal, -1);
  CGPoint midpoint = CUCursorMultiply(CUCursorAdd(start, end), .5);
  double radius = CUCursorClamp(length * CUCursorMotionDefaults.arcSize, 50, 520);
  double flow = CUCursorClamp(length * CUCursorMotionDefaults.arcFlow, 38, 440);
  const double radii[3] = {.55, .8, 1.05}, flows[3] = {.65, 1, 1.35};
  for (NSUInteger r = 0; r < 3; r++) for (NSUInteger f = 0; f < 3; f++) for (NSUInteger sign = 0; sign < 2; sign++) {
    CGPoint arc = CUCursorAdd(CUCursorAdd(midpoint, CUCursorMultiply(normal, radius * radii[r] * (sign ? -1 : 1))), CUCursorMultiply(click, h1 * .16));
    CUCursorCubic first = {start, CUCursorAdd(start, CUCursorMultiply(click, h1)), CUCursorSubtract(arc, CUCursorMultiply(direction, flow * flows[f])), arc};
    CUCursorCubic second = {arc, CUCursorAdd(arc, CUCursorMultiply(direction, flow * flows[f])), CUCursorSubtract(end, CUCursorMultiply(click, h2)), end};
    paths[count++] = (CUCursorPath){{first, second}, 2, YES};
  }
  return count;
}
static inline double CUCursorPathScore(CUCursorPath path, CUCursorPathMetrics m) {
  CGPoint start = path.segments[0].start, end = path.segments[path.count - 1].end;
  double distance = hypot(end.x - start.x, end.y - start.y), excess = fmax(0, m.length / fmax(1, distance) - 1);
  return m.length + excess * 320 + m.energy * 140 + m.maximumTurn * 180 + m.totalTurn * 18 + CUCursorDirectionPenalty(start, end) * 90 + (path.arc ? 45 : 0);
}
// Original chooser 0x10009a890 and ranking 0x10009ab24 preserve first equal-score candidate.
static inline CUCursorPath CUCursorChoosePath(CGPoint start, CGPoint end, CGRect bounds) {
  CGPoint delta = CUCursorSubtract(end, start);
  if (hypot(delta.x, delta.y) <= CUCursorMotionDefaults.straightThreshold) {
    CUCursorCubic cubic = {start, CUCursorAdd(start, CUCursorMultiply(delta, 1.0/3)), CUCursorAdd(start, CUCursorMultiply(delta, 2.0/3)), end};
    return (CUCursorPath){{cubic}, 1, NO};
  }
  CUCursorPath paths[20]; CUCursorPathMetrics metrics[20]; double scores[20];
  NSUInteger count = CUCursorGeneratePaths(start, end, paths); BOOL hasBounded = NO;
  for (NSUInteger i = 0; i < count; i++) { metrics[i] = CUCursorMeasurePath(paths[i], bounds); hasBounded |= metrics[i].inBounds; scores[i] = CUCursorPathScore(paths[i], metrics[i]); }
  NSUInteger best = NSNotFound;
  for (NSUInteger i = 0; i < count; i++) if ((!hasBounded || metrics[i].inBounds) && (best == NSNotFound || scores[i] < scores[best])) best = i;
  return paths[best];
}
static inline double CUCursorPathResponse(CUCursorPath path, CUCursorPathMetrics m) {
  CGPoint start = path.segments[0].start, end = path.segments[path.count - 1].end;
  double distance = hypot(end.x - start.x, end.y - start.y), excess = fmax(0, m.length / fmax(1, distance) - 1);
  double complexity = CUCursorClamp(CUCursorClamp(excess / .55, 0, 1) * .42 + CUCursorClamp(m.totalTurn / (M_PI * 1.4), 0, 1) * .38 + CUCursorClamp(m.energy / 1.25, 0, 1) * .2, 0, 1);
  double response = (.42 + CUCursorClamp((m.length - 180) / 760, 0, 1) * .22 + complexity * .12 + CUCursorDirectionPenalty(start, end) * .28 + (path.arc ? .04 : 0)) * CUCursorMotionDefaults.responseMultiplier * (path.arc ? .9 : 1);
  return CUCursorClamp(response, CUCursorMotionDefaults.minimumResponse, CUCursorMotionDefaults.maximumResponse);
}
static inline CGPoint CUCursorPathPoint(CUCursorPath path, double progress, CGPoint *derivative) {
  double scaled = CUCursorClamp(progress, 0, 1) * path.count;
  NSUInteger index = MIN((NSUInteger)scaled, path.count - 1);
  double t = scaled - index;
  if (derivative) *derivative = CUCursorCubicDerivative(path.segments[index], t);
  return CUCursorCubicPoint(path.segments[index], t);
}
static inline CGPoint CUCursorBlendDirection(CGPoint direction, double progress) {
  CGPoint click = CUCursorClickDirection(); direction = hypot(direction.x, direction.y) < .001 ? click : CUCursorNormalize(direction);
  double t = CUCursorClamp((progress - CUCursorMotionDefaults.directionProgress) / (1 - CUCursorMotionDefaults.directionProgress), 0, 1);
  double eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return CUCursorNormalize(CUCursorAdd(CUCursorMultiply(direction, 1 - eased), CUCursorMultiply(click, eased)));
}

typedef struct {
  double position, target, velocity, acceleration, stiffness, damping, tolerance, elapsed;
} CUCursorSpring;
static inline CUCursorSpring CUCursorSpringMake(double start, double target, double response, double dampingRatio, double tolerance) {
  double stiffness = fmin(28800, pow(2 * M_PI / response, 2));
  return (CUCursorSpring){start, target, 0, 0, stiffness, 2 * dampingRatio * sqrt(stiffness), tolerance, 0};
}
// Original Spring solver 0x1007e69f0: fixed-step velocity Verlet.
static inline void CUCursorSpringStep(CUCursorSpring *spring) {
  const double step = 1.0 / 240;
  double middleVelocity = spring->velocity + spring->acceleration * step * .5;
  spring->position += middleVelocity * step;
  spring->acceleration = spring->stiffness * (spring->target - spring->position) - spring->damping * middleVelocity;
  spring->velocity = middleVelocity + spring->acceleration * step * .5;
  spring->elapsed += step;
}
static inline void CUCursorSpringAdvance(CUCursorSpring *spring, double elapsed) {
  // Original 0x1007e5ce4 skips stale backlog after a one-second scheduling gap.
  if (elapsed - spring->elapsed > 1) spring->elapsed = elapsed - 1.0 / 60;
  while (spring->elapsed < elapsed) CUCursorSpringStep(spring);
}
// Original completion predicate 0x1007e5d90 uses squared vector magnitudes.
static inline BOOL CUCursorSpringComplete(CUCursorSpring x, const CUCursorSpring *y) {
  double velocity = x.velocity*x.velocity, acceleration = x.acceleration*x.acceleration;
  double error = (x.target-x.position)*(x.target-x.position), relative = x.target*x.target*.0001;
  if (y) {
    velocity += y->velocity*y->velocity; acceleration += y->acceleration*y->acceleration;
    error += (y->target-y->position)*(y->target-y->position); relative += y->target*y->target*.0001;
  }
  return fmax(velocity, acceleration) <= x.tolerance*x.tolerance && (relative <= 0 || error <= relative);
}
