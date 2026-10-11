#include "dynamics.h"

#import <Foundation/Foundation.h>

#include <cmath>
#include <limits>

#pragma clang fp contract(off)

namespace opencu::pip {
namespace {

Point add(Point a, Point b) { return {a.x + b.x, a.y + b.y}; }
Point subtract(Point a, Point b) { return {a.x - b.x, a.y - b.y}; }
double length(Point value) { return std::hypot(value.x, value.y); }

NSRect nativeRect(Rect value) {
  return NSMakeRect(value.origin.x, value.origin.y, value.size.width,
                    value.size.height);
}

Rect rect(NSRect value) {
  return {{value.origin.x, value.origin.y},
          {value.size.width, value.size.height}};
}

void includeRect(std::optional<Rect>& envelope, Rect value) {
  envelope = envelope ? rect(NSUnionRect(nativeRect(*envelope), nativeRect(value)))
                      : value;
}

bool bottomAligned(std::uint64_t alignment) {
  return alignment == 2 || alignment == 3 || alignment == 5;
}

double indexDistance(std::size_t index, std::ptrdiff_t leadIndex) {
  if (leadIndex < 0) return 0;
  const auto lead = static_cast<std::size_t>(leadIndex);
  return static_cast<double>(index >= lead ? index - lead : lead - index);
}

double smoothstep(double value) {
  const double t = std::fmin(value < 0 ? 0 : value, 1);
  return (t * t) * std::fma(t, -2, 3);
}

}  // namespace

// sky.node 0x22c68, 0x24778.
Point appearanceAnchorPoint(std::uint64_t alignment) {
  const double x = (alignment == 4 || alignment == 5)
                       ? 0.5
                       : static_cast<double>(alignment != 0 && alignment != 3);
  return {x, static_cast<double>(!bottomAligned(alignment))};
}

Point restOffset(Size size, std::size_t index, std::uint64_t alignment) {
  const Point appearance = appearanceAnchorPoint(alignment);
  const double n = static_cast<double>(index);
  const double horizontalDirection = std::fma(appearance.x, -2, 1);
  const double verticalBase = bottomAligned(alignment) ? 0 : -size.height;
  const double verticalIndex = bottomAligned(alignment) ? n : -n;
  return {std::fma(horizontalDirection * n, 28, -size.width * appearance.x),
          std::fma(verticalIndex, 22, verticalBase)};
}

// sky.node 0x2e01c. Small source content is allowed to scale up.
Size displaySizeForSourceSize(Size source, double maximumDisplaySize) {
  const double maximum = std::isfinite(maximumDisplaySize)
                             ? std::fmin(std::fmax(maximumDisplaySize, 1), 400)
                             : 200;
  if (!(source.width > 0) || !(source.height > 0) ||
      !std::isfinite(source.width) || !std::isfinite(source.height)) {
    return {maximum, maximum};
  }
  const double scale = std::fmin(maximum / source.width, maximum / source.height);
  return {std::fmax(source.width * scale, 1),
          std::fmax(source.height * scale, 1)};
}

bool contributesToStackLayout(const LayoutItem& item, std::size_t index,
                             std::size_t visibleStackItemLimit) {
  return index < visibleStackItemLimit || item.contributesToStackLayout;
}

// sky.node 0x2451c uses stored offsets; 0x24778 recomputes using original index.
Point currentStackAnchorOrDefault(const std::vector<LayoutItem>& items,
                                 std::size_t visibleStackItemLimit,
                                 std::optional<Point> restAnchorScreenPoint) {
  if (!restAnchorScreenPoint) return {};
  Point sum;
  std::size_t count = 0;
  for (std::size_t index = 0; index < items.size(); ++index) {
    const auto& item = items[index];
    if (!item.itemExists || !item.motion || !item.motion->initialized ||
        !contributesToStackLayout(item, index, visibleStackItemLimit)) continue;
    sum = add(sum, subtract(item.motion->origin, item.motion->restOffset));
    ++count;
  }
  if (!count) return *restAnchorScreenPoint;
  const double reciprocal = 1 / static_cast<double>(count);
  return {sum.x * reciprocal, sum.y * reciprocal};
}

Point currentStackAnchorForAlignment(const std::vector<LayoutItem>& items,
                                    std::size_t visibleStackItemLimit,
                                    std::uint64_t alignment,
                                    std::optional<Point> restAnchorScreenPoint) {
  if (!restAnchorScreenPoint) return {};
  Point sum;
  std::size_t count = 0;
  for (std::size_t index = 0; index < items.size(); ++index) {
    const auto& item = items[index];
    if (!item.itemExists || !item.motion || !item.motion->initialized ||
        !contributesToStackLayout(item, index, visibleStackItemLimit)) continue;
    sum = add(sum, subtract(item.motion->origin,
                            restOffset(item.displaySize, index, alignment)));
    ++count;
  }
  if (!count) return *restAnchorScreenPoint;
  const double reciprocal = 1 / static_cast<double>(count);
  return {sum.x * reciprocal, sum.y * reciprocal};
}

void updateRestOffsetsForAlignment(std::vector<LayoutItem>& items,
                                  std::size_t visibleStackItemLimit,
                                  std::uint64_t alignment,
                                  std::optional<Point> restAnchorScreenPoint) {
  const Point anchor = currentStackAnchorForAlignment(
      items, visibleStackItemLimit, alignment, restAnchorScreenPoint);
  std::size_t validIndex = 0;
  for (auto& item : items) {
    if (!item.itemExists || !item.motion) continue;
    auto& motion = *item.motion;
    motion.restOffset = restOffset(item.displaySize, validIndex, alignment);
    if (!motion.initialized) {
      motion.origin = add(anchor, motion.restOffset);
      motion.target = motion.origin;
      motion.velocity = {};
      motion.initialized = true;
    }
    ++validIndex;
  }
}

// sky.node 0x24274 does not require motion.initialized.
Size stackRestSize(const std::vector<LayoutItem>& items,
                   std::size_t visibleStackItemLimit) {
  std::optional<Rect> envelope;
  for (std::size_t index = 0; index < items.size(); ++index) {
    const auto& item = items[index];
    if (!item.itemExists || !item.motion ||
        !contributesToStackLayout(item, index, visibleStackItemLimit)) continue;
    includeRect(envelope, {item.motion->restOffset, item.displaySize});
  }
  return envelope ? envelope->size : Size{};
}

// sky.node 0x24d54. Programmatic followers use quadratic index distance.
Spring motionSpring(std::size_t itemIndex, std::ptrdiff_t leadIndex,
                    bool isLead, bool dragging, bool programmaticMove) {
  if (isLead) return dragging ? Spring{900, 55} : Spring{320, 42};
  double distance = indexDistance(itemIndex, leadIndex);
  if (programmaticMove) distance *= std::fma(distance, 0.45, 1);
  return {(dragging ? 260 : 150) / std::fma(distance, 0.18, 1),
          (dragging ? 32 : 30) / std::fma(distance, 0.08, 1)};
}

void configureMotionSprings(std::vector<LayoutItem>& items,
                            std::ptrdiff_t leadIndex, bool dragging,
                            bool programmaticMove) {
  for (std::size_t index = 0; index < items.size(); ++index) {
    if (!items[index].motion) continue;
    const bool isLead = leadIndex >= 0 &&
                        static_cast<std::size_t>(leadIndex) == index;
    const Spring spring = motionSpring(index, leadIndex, isLead, dragging,
                                       programmaticMove);
    items[index].motion->springStiffness = spring.stiffness;
    items[index].motion->springDamping = spring.damping;
    items[index].motion->leadsMotion = isLead;
  }
}

// sky.node 0x250a4 applies the same normalized coefficients to active and exits.
Spring normalizedSpringParameters(SpringParameters parameters) {
  return {parameters.stiffness / parameters.mass,
          parameters.damping / parameters.mass};
}

void configureMotionSpringsWithParameters(std::vector<LayoutItem>& items,
                                         std::vector<LayoutItem>& exitingItems,
                                         SpringParameters parameters) {
  const Spring spring = normalizedSpringParameters(parameters);
  for (auto* group : {&items, &exitingItems}) {
    for (auto& item : *group) {
      if (!item.motion) continue;
      item.motion->springStiffness = spring.stiffness;
      item.motion->springDamping = spring.damping;
    }
  }
}

// sky.node 0x2069c only injects a release velocity when one was supplied.
Point releaseVelocity(Point draggingVelocity, std::size_t itemIndex,
                      std::ptrdiff_t leadIndex, bool isLead) {
  const Point velocity = length(draggingVelocity) < 120
                             ? Point{}
                             : Point{draggingVelocity.x * 0.25,
                                     draggingVelocity.y * 0.25};
  const double weight = isLead || leadIndex < 0
                            ? 1
                            : 1 / std::fma(indexDistance(itemIndex, leadIndex),
                                          0.45, 1);
  return {velocity.x * weight, velocity.y * weight};
}

// sky.node 0x26090: pre-step position error, post-step velocity, no snap.
bool exactStep(MotionState& state, Point anchor, double deltaSeconds) {
  state.target = add(anchor, state.restOffset);
  const Point error = subtract(state.target, state.origin);
  const double ax = error.x * state.springStiffness -
                    state.velocity.x * state.springDamping;
  const double ay = error.y * state.springStiffness -
                    state.velocity.y * state.springDamping;
  state.velocity.x += deltaSeconds * ax;
  state.velocity.y += deltaSeconds * ay;
  state.origin.x += deltaSeconds * state.velocity.x;
  state.origin.y += deltaSeconds * state.velocity.y;
  return length(error) <= 0.5 && length(state.velocity) <= 2;
}

double motionDeltaSeconds(double timestamp, double previousTimestamp) {
  const double elapsed = timestamp - previousTimestamp;
  return std::fmin(elapsed < 1.0 / 120 ? 1.0 / 120 : elapsed, 1.0 / 30);
}

// sky.node 0x252b4; currentFrame is local to the real panel.
void synchronizeMotionOrigin(MotionState& motion, Rect currentFrame,
                             Point panelScreenOrigin) {
  if (!motion.initialized) return;
  motion.origin = add(currentFrame.origin, panelScreenOrigin);
  motion.target = motion.origin;
  motion.velocity = {};
}

// sky.node 0x21bb8 preserves the center of alignments 4 and 5 during resize.
void reconcileCenteredAlignmentOrigin(MotionState& motion, Size currentFrameSize,
                                      Size displaySize,
                                      std::uint64_t alignment) {
  if (alignment != 4 && alignment != 5) return;
  motion.origin.x += (currentFrameSize.width - displaySize.width) * 0.5;
  if (!bottomAligned(alignment)) {
    motion.origin.y += currentFrameSize.height - displaySize.height;
  }
}

void translateMotionOrigins(std::vector<LayoutItem>& items, Point translation) {
  for (auto& item : items) {
    if (!item.motion) continue;
    item.motion->origin = add(item.motion->origin, translation);
    item.motion->target = add(item.motion->target, translation);
  }
}

void placeMotionAtAnchor(MotionState& motion, Point anchor) {
  motion.origin = add(anchor, motion.restOffset);
  motion.target = motion.origin;
  motion.velocity = {};
}

// sky.node 0x1fcd8 intentionally does not deduplicate default vs registered.
std::vector<std::size_t> compatibleHosts(
    const std::vector<Host>& hosts, std::optional<std::size_t> currentHost,
    std::optional<std::size_t> defaultHost,
    const std::vector<std::size_t>& registeredHostOrder, bool includeDragHosts) {
  if (!currentHost) return {};
  std::vector<std::size_t> result{*currentHost};
  if (!includeDragHosts) return result;
  const auto& currentID = hosts.at(*currentHost).hostID;
  if (defaultHost && hosts.at(*defaultHost).hostID != currentID) {
    result.push_back(*defaultHost);
  }
  for (const std::size_t index : registeredHostOrder) {
    if (hosts.at(index).hostID != currentID) result.push_back(index);
  }
  return result;
}

std::vector<Anchor> anchorsForHost(const Host& host, std::size_t hostIndex,
                                 double stackDisplayWidth,
                                 double stackRestWidth) {
  std::vector<Anchor> result;
  if (!host.screenAnchors.empty()) {
    for (auto anchor : host.screenAnchors) {
      anchor.hostIndex = hostIndex;
      if (host.codexHomeAvailable && anchor.alignment == 1) {
        anchor.point.x += (stackDisplayWidth - stackRestWidth) * -0.5;
      }
      result.push_back(anchor);
    }
    return result;
  }
  const auto& frame = host.anchorFrame;
  const double left = frame.origin.x + 24;
  const double right = frame.origin.x + frame.size.width - 24;
  const double bottom = frame.origin.y + 24;
  const double top = frame.origin.y + frame.size.height - 24;
  return {{{left, bottom}, 3, hostIndex}, {{right, bottom}, 2, hostIndex},
          {{left, top}, 0, hostIndex}, {{right, top}, 1, hostIndex}};
}

std::vector<Anchor> compatibleAnchors(
    const std::vector<Host>& hosts, std::optional<std::size_t> currentHost,
    std::optional<std::size_t> defaultHost,
    const std::vector<std::size_t>& registeredHostOrder, bool includeDragHosts,
    std::optional<Point> restAnchorScreenPoint, double stackDisplayWidth,
    double stackRestWidth, bool stackWindowAvailable) {
  if (!stackWindowAvailable) return {};
  const auto hostOrder = compatibleHosts(hosts, currentHost, defaultHost,
                                         registeredHostOrder, includeDragHosts);
  if (hostOrder.empty()) return {fallbackAnchor(restAnchorScreenPoint, currentHost)};
  std::vector<Anchor> result;
  for (const auto index : hostOrder) {
    const auto anchors = anchorsForHost(hosts.at(index), index, stackDisplayWidth,
                                        stackRestWidth);
    result.insert(result.end(), anchors.begin(), anchors.end());
  }
  return result;
}

std::optional<Anchor> preferredAnchor(const std::vector<Anchor>& anchors,
                                     std::uint64_t currentAlignment) {
  for (const auto& anchor : anchors) {
    if (anchor.alignment == currentAlignment) return anchor;
  }
  return anchors.empty() ? std::nullopt : std::optional<Anchor>{anchors.front()};
}

std::optional<Anchor> preferredCompatibleAnchor(
    const std::vector<Anchor>& anchors,
    std::optional<std::uint64_t> preferredAlignment) {
  if (!preferredAlignment) return std::nullopt;
  for (const auto& anchor : anchors) {
    if (anchor.alignment == *preferredAlignment) return anchor;
  }
  return std::nullopt;
}

Anchor fallbackAnchor(std::optional<Point> restAnchorScreenPoint,
                      std::optional<std::size_t> currentHost) {
  return {restAnchorScreenPoint.value_or(Point{}), 1, currentHost};
}

bool includesDragHosts(bool dragHasMoved, Point currentDragVelocity) {
  return dragHasMoved || length(currentDragVelocity) >= 120;
}

// sky.node 0x20184. A null velocity selects the first candidate directly.
AnchorSelection nearestTargetAnchor(
    Point currentAnchor, std::optional<Point> draggingVelocity,
    const std::vector<Anchor>& candidates, const std::vector<Host>& hosts,
    std::optional<std::string> currentHostID, Anchor fallback) {
  if (candidates.empty()) return {fallback, 0, 0, currentAnchor, true};
  if (!draggingVelocity) return {candidates.front(), 0, 0, currentAnchor, false};
  const Point velocity{draggingVelocity->x * 0.55, draggingVelocity->y * 0.55};
  const double speed = length(velocity);
  const double proposedProjection = speed / 5000 + 0.18;
  const double projection = std::fmin(
      proposedProjection < 0.18 ? 0.18 : proposedProjection, 0.45);
  const Point projected{currentAnchor.x + velocity.x * projection,
                        currentAnchor.y + velocity.y * projection};
  const Point direction = speed > 0
                              ? Point{velocity.x * (1 / speed),
                                      velocity.y * (1 / speed)}
                              : Point{};
  AnchorSelection result{candidates.front(), 0,
                         std::numeric_limits<double>::max(), projected, false};
  for (std::size_t index = 0; index < candidates.size(); ++index) {
    const auto& candidate = candidates[index];
    double penalty = 0;
    if (candidate.hostIndex) {
      const auto& host = hosts.at(*candidate.hostIndex);
      if (!currentHostID || host.hostID != *currentHostID) {
        const NSRect bounds = NSInsetRect(nativeRect(host.anchorFrame), -120, -120);
        if (!NSPointInRect(NSMakePoint(projected.x, projected.y), bounds)) continue;
        penalty = 180;
      }
    }
    const Point displacement = subtract(candidate.point, currentAnchor);
    const double distance = length(displacement);
    double reward = 0;
    if (speed > 0 && distance > 0) {
      const double reciprocal = 1 / distance;
      const double dot = std::fma(direction.x, displacement.x * reciprocal,
                                  direction.y * (displacement.y * reciprocal));
      reward = (speed * std::fmax(dot, 0)) * 0.12;
    }
    const double score = penalty + (length(subtract(candidate.point, projected)) - reward);
    if (score < result.score) {
      result.anchor = candidate;
      result.candidateIndex = index;
      result.score = score;
    }
  }
  return result;
}

// sky.node 0x21264, with the same fused operations as the native helper.
Point programmaticMoveControlPoint(Point start, const Anchor& target,
                                  bool targetHostHasCodexHome) {
  const double top = start.y < target.point.y ? target.point.y : start.y;
  double y = std::fma(top + 72, 2, start.y * -0.5);
  y = std::fma(target.point.y, -0.5, y);
  if (targetHostHasCodexHome && target.alignment == 1) y = top;
  const double midpoint = (start.x + target.point.x) * 0.5;
  const double x = std::fma(target.point.x, -0.5,
                           std::fma(midpoint, 2, start.x * -0.5));
  return {x, y};
}

// sky.node 0x20bd4 compares actual owner-window object identity for handoff.
ProgrammaticMove beginProgrammaticMove(
    Point start, Anchor target, double startTimestamp,
    bool windowHiddenForDOMVideo, bool targetHostHasCodexHome,
    std::uintptr_t currentOwnerWindowIdentity,
    std::uintptr_t targetOwnerWindowIdentity) {
  ProgrammaticMove move;
  move.startPoint = start;
  move.targetAnchor = target;
  move.controlPoint = programmaticMoveControlPoint(start, target,
                                                   targetHostHasCodexHome);
  move.startTimestamp = startTimestamp;
  move.suspendedForDOM = windowHiddenForDOMVideo && target.alignment == 2;
  if (move.suspendedForDOM) {
    move.controlPoint.y = move.controlPoint.y < start.y
                             ? move.controlPoint.y : start.y;
  }
  move.waitingForHostHandoff = target.hostIndex &&
      ((targetHostHasCodexHome && target.alignment == 1) ||
       (currentOwnerWindowIdentity != targetOwnerWindowIdentity &&
        (target.alignment == 4 || target.alignment == 5)));
  return move;
}

bool updateProgrammaticMove(ProgrammaticMove& move, double timestamp,
                           Anchor& currentTargetAnchor) {
  if (move.waitingForHostHandoff || move.suspendedForDOM) return false;
  const double time = (timestamp - move.startTimestamp) / move.duration;
  currentTargetAnchor = move.targetAnchor;
  if (time >= 1) {
    move.reachedTarget = true;
    return true;
  }
  const double t = smoothstep(time);
  const double inverse = 1 - t;
  const double startWeight = inverse * inverse;
  const double controlWeight = t * (inverse + inverse);
  const double targetWeight = t * t;
  currentTargetAnchor.point = {
      std::fma(targetWeight, move.targetAnchor.point.x,
               std::fma(startWeight, move.startPoint.x,
                        controlWeight * move.controlPoint.x)),
      std::fma(targetWeight, move.targetAnchor.point.y,
               std::fma(startWeight, move.startPoint.y,
                        controlWeight * move.controlPoint.y))};
  return true;
}

double programmaticMoveProgress(const ProgrammaticMove& move,
                                double lastMotionTimestamp) {
  if (move.waitingForHostHandoff || move.suspendedForDOM) return 0;
  const double time = std::fmax((lastMotionTimestamp - move.startTimestamp) / 0.32, 0);
  return smoothstep(time);
}

Size renderedSize(Size displaySize, const MotionState* motion,
                  const ProgrammaticMove* move, double lastMotionTimestamp) {
  if (!move) return displaySize;
  const Size start = motion ? motion->moveStartSize : Size{};
  const double progress = programmaticMoveProgress(*move, lastMotionTimestamp);
  return {std::fma(displaySize.width - start.width, progress, start.width),
          std::fma(displaySize.height - start.height, progress, start.height)};
}

double homeTransitionProgress(double targetProgress, const MotionState& motion,
                              const ProgrammaticMove* move,
                              double lastMotionTimestamp) {
  if (!move) return targetProgress;
  return std::fma(targetProgress - motion.moveStartHomeTransitionProgress,
                  programmaticMoveProgress(*move, lastMotionTimestamp),
                  motion.moveStartHomeTransitionProgress);
}

// sky.node 0x259fc changes the step target to the rendered-size rest offset.
Point motionStepAnchor(Point currentTargetAnchor, const LayoutItem& item,
                       std::size_t originalIndex, std::uint64_t alignment,
                       const ProgrammaticMove* move, double lastMotionTimestamp,
                       bool programmaticMoveUpdated) {
  if (!programmaticMoveUpdated || !item.motion) return currentTargetAnchor;
  const Point offset = restOffset(renderedSize(item.displaySize, item.motion, move,
                                              lastMotionTimestamp),
                                   originalIndex, alignment);
  return add(currentTargetAnchor, subtract(offset, item.motion->restOffset));
}

double snapToBackingScale(double value, double backingScale) {
  if (!(backingScale > 0) || !std::isfinite(backingScale)) return value;
  return std::round(value * backingScale) / backingScale;
}

Point snapPointToBackingScale(Point point, double backingScale) {
  return {snapToBackingScale(point.x, backingScale),
          snapToBackingScale(point.y, backingScale)};
}

Rect clampEnvelopeToVisibleScreen(Rect envelope,
                                 std::optional<Rect> visibleScreenFrame,
                                 double backingScale) {
  if (!visibleScreenFrame) return envelope;
  const auto& visible = *visibleScreenFrame;
  const double right = envelope.origin.x + envelope.size.width;
  const double visibleRight = visible.origin.x + visible.size.width;
  if (right > visibleRight) envelope.origin.x -= right - visibleRight;
  if (envelope.origin.x < visible.origin.x) {
    envelope.origin.x += visible.origin.x - envelope.origin.x;
  }
  const double top = envelope.origin.y + envelope.size.height;
  const double visibleTop = visible.origin.y + visible.size.height;
  if (top > visibleTop) envelope.origin.y -= top - visibleTop;
  if (envelope.origin.y < visible.origin.y) {
    envelope.origin.y += visible.origin.y - envelope.origin.y;
  }
  envelope.origin = snapPointToBackingScale(envelope.origin, backingScale);
  return envelope;
}

std::optional<Rect> motionContentEnvelope(
    const std::vector<LayoutItem>& items,
    const std::vector<LayoutItem>& exitingItems,
    std::size_t visibleStackItemLimit, const ProgrammaticMove* move,
    double lastMotionTimestamp) {
  std::optional<Rect> envelope;
  for (std::size_t index = 0; index < items.size(); ++index) {
    const auto& item = items[index];
    if (!item.itemExists || !item.motion ||
        !contributesToStackLayout(item, index, visibleStackItemLimit)) continue;
    includeRect(envelope, {item.motion->origin,
                           renderedSize(item.displaySize, item.motion, move,
                                        lastMotionTimestamp)});
  }
  for (const auto& item : exitingItems) {
    if (!item.itemExists || !item.motion) continue;
    includeRect(envelope, {item.motion->origin,
                           renderedSize(item.displaySize, item.motion, move,
                                        lastMotionTimestamp)});
  }
  return envelope;
}

// sky.node 0x23150. The screen and backing scale are supplied by the real panel.
Rect resizeFrozenEnvelope(Rect contentEnvelope, double overscan,
                          std::size_t visibleCount, std::size_t exitingCount,
                          std::uint64_t resizeAlignment,
                          std::uint64_t currentAlignment,
                          std::optional<Point> frozenAnchorScreenPoint,
                          std::optional<Rect> visibleScreenFrame,
                          double backingScale) {
  const std::uint64_t alignment = currentAlignment == 4 || currentAlignment == 5
                                      ? currentAlignment
                                      : resizeAlignment;
  const Point anchor = frozenAnchorScreenPoint.value_or(Point{
      std::fma(contentEnvelope.size.width, 0.5, contentEnvelope.origin.x),
      std::fma(contentEnvelope.size.height, 0.5, contentEnvelope.origin.y)});
  const std::size_t total = visibleCount + exitingCount;
  const double followers = static_cast<double>(total ? total - 1 : 0);
  const double height = std::fmax(
      std::fma(overscan, 2, contentEnvelope.size.height),
      std::fma(overscan, 2, followers * 22 + 400));
  const double width = std::fmax(
      std::fma(overscan, 2, contentEnvelope.size.width),
      std::fma(overscan, 2, followers * 28 + 400));
  const double horizontal = appearanceAnchorPoint(alignment).x;
  const double x = std::fma(overscan, std::fma(horizontal, 2, -1),
                           std::fma(-width, horizontal, anchor.x));
  const double y = bottomAligned(alignment)
                       ? anchor.y - overscan
                       : (anchor.y - height) + overscan;
  Rect result = rect(NSUnionRect(
      NSMakeRect(x, y, width, height),
      NSInsetRect(nativeRect(contentEnvelope), -overscan, -overscan)));
  result.origin = snapPointToBackingScale(result.origin, backingScale);
  result.size.width = snapToBackingScale(std::fmax(result.size.width, 1), backingScale);
  result.size.height = snapToBackingScale(std::fmax(result.size.height, 1), backingScale);
  result = clampEnvelopeToVisibleScreen(result, visibleScreenFrame, backingScale);
  result.origin.x = std::floor(result.origin.x);
  result.origin.y = std::floor(result.origin.y);
  return result;
}

// sky.node 0x26238. Frozen resize frames may be replaced with the actual panel
// frame by the caller after setEnvelopeScreenFrame returns.
EnvelopeResult motionEnvelope(Rect contentEnvelope, bool expanded,
                              bool resizing, std::size_t visibleCount,
                              std::size_t exitingCount,
                              std::uint64_t resizeAlignment,
                              std::uint64_t currentAlignment,
                              std::optional<Point> frozenAnchorScreenPoint,
                              std::optional<Rect> visibleScreenFrame,
                              double backingScale, EnvelopeState& state) {
  if (!expanded) {
    state.expandedSizeInitialized = false;
    state.expandedSize = {};
    return {rect(NSInsetRect(nativeRect(contentEnvelope), -66, -66)), false};
  }
  if (resizing) {
    if (state.resizeFrozenEnvelope) return {*state.resizeFrozenEnvelope, false};
    state.resizeFrozenEnvelope = resizeFrozenEnvelope(
        contentEnvelope, 246, visibleCount, exitingCount, resizeAlignment,
        currentAlignment, frozenAnchorScreenPoint, visibleScreenFrame, backingScale);
    return {*state.resizeFrozenEnvelope, true};
  }
  const Size proposed{std::fma(246, 2, contentEnvelope.size.width),
                       std::fma(246, 2, contentEnvelope.size.height)};
  if (state.expandedSizeInitialized) {
    state.expandedSize.width = state.expandedSize.width < proposed.width
                                  ? proposed.width : state.expandedSize.width;
    state.expandedSize.height = state.expandedSize.height < proposed.height
                                   ? proposed.height : state.expandedSize.height;
  } else {
    state.expandedSize = proposed;
    state.expandedSizeInitialized = true;
  }
  Rect envelope{{std::fma(contentEnvelope.size.width, 0.5, contentEnvelope.origin.x) -
                      state.expandedSize.width * 0.5,
                  std::fma(contentEnvelope.size.height, 0.5, contentEnvelope.origin.y) -
                      state.expandedSize.height * 0.5},
                 state.expandedSize};
  return {clampEnvelopeToVisibleScreen(envelope, visibleScreenFrame, backingScale), false};
}

// sky.node 0x26238. The actual panel origin is read after applying its envelope.
MotionFrames applyMotionFrames(const std::vector<LayoutItem>& items,
                              const std::vector<LayoutItem>& exitingItems,
                              std::size_t visibleStackItemLimit,
                              Point actualPanelScreenOrigin,
                              const Anchor* currentTargetAnchor,
                              const std::vector<Host>& hosts,
                              const ProgrammaticMove* move,
                              double lastMotionTimestamp, bool expanded) {
  MotionFrames result;
  const std::size_t visibleCount = items.size() < visibleStackItemLimit
                                       ? items.size() : visibleStackItemLimit;
  result.controlsAboveItem = visibleCount > 1;
  result.controlsDocked = !expanded;
  const Anchor* target = move ? &move->targetAnchor : currentTargetAnchor;
  double targetHomeProgress = 0;
  if (target && target->hostIndex && target->alignment == 1 &&
      hosts.at(*target->hostIndex).codexHomeAvailable) {
    targetHomeProgress = 1;
  }
  std::optional<Rect> leadFrame;
  std::optional<Rect> highestFrame;
  for (std::size_t index = 0; index < items.size(); ++index) {
    const auto& item = items[index];
    if (!item.itemExists || !item.motion) continue;
    const Rect frame{subtract(item.motion->origin, actualPanelScreenOrigin),
                      renderedSize(item.displaySize, item.motion, move,
                                   lastMotionTimestamp)};
    const bool visible = index < visibleStackItemLimit;
    const std::size_t zIndex = !visible ? 0 :
        (visibleCount - index) + (item.motion->leadsMotion ? visibleCount + 1 : 0);
    result.items.push_back({index, frame, zIndex,
                            homeTransitionProgress(targetHomeProgress, *item.motion,
                                                    move, lastMotionTimestamp)});
    if (!visible) continue;
    if (index == 0) {
      leadFrame = frame;
      result.controlsVisible = true;
    }
    if (!highestFrame ||
        highestFrame->origin.y + highestFrame->size.height <
            frame.origin.y + frame.size.height) {
      highestFrame = frame;
    }
  }
  for (std::size_t index = 0; index < exitingItems.size(); ++index) {
    const auto& item = exitingItems[index];
    if (!item.itemExists || !item.motion) continue;
    result.exitingItems.push_back({
        index, {subtract(item.motion->origin, actualPanelScreenOrigin),
                 renderedSize(item.displaySize, item.motion, move,
                              lastMotionTimestamp)},
        std::nullopt, std::nullopt});
  }
  result.controlReferenceFrame = visibleCount > 1 && highestFrame
                                     ? *highestFrame : leadFrame.value_or(Rect{});
  return result;
}

}  // namespace opencu::pip
