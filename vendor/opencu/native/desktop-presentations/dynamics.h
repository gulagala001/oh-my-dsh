#ifndef OPENCU_DESKTOP_PRESENTATIONS_DYNAMICS_H
#define OPENCU_DESKTOP_PRESENTATIONS_DYNAMICS_H

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace opencu::pip {

struct Point {
  double x = 0;
  double y = 0;
};

struct Size {
  double width = 0;
  double height = 0;
};

struct Rect {
  Point origin;
  Size size;
};

struct MotionState {
  Point origin;
  Point velocity;
  Point restOffset;
  Point target;
  Size moveStartSize;
  double moveStartHomeTransitionProgress = 0;
  double springStiffness = 260;
  double springDamping = 32;
  bool initialized = false;
  bool leadsMotion = false;
};

// Keep missing dictionary entries in their original publication-order slots.
struct LayoutItem {
  Size displaySize;
  MotionState* motion = nullptr;
  bool contributesToStackLayout = false;
  bool itemExists = true;
};

struct Spring {
  double stiffness = 260;
  double damping = 32;
};

// The original native parameter struct stores damping, mass, stiffness.
struct SpringParameters {
  double damping = 0;
  double mass = 0;
  double stiffness = 0;
};

struct Anchor {
  Point point;
  std::uint64_t alignment = 1;
  std::optional<std::size_t> hostIndex;
};

struct Host {
  std::string hostID;
  Rect anchorFrame;
  // Resolve contentPoint through the real NSView/NSWindow before supplying it.
  std::vector<Anchor> screenAnchors;
  bool codexHomeAvailable = false;
};

struct AnchorSelection {
  Anchor anchor;
  std::size_t candidateIndex = 0;
  double score = 0;
  Point projectedPoint;
  bool usedFallback = false;
};

struct ProgrammaticMove {
  Point startPoint;
  Anchor targetAnchor;
  Point controlPoint;
  double startTimestamp = 0;
  double duration = 0.32;
  bool waitingForHostHandoff = false;
  bool suspendedForDOM = false;
  bool reachedTarget = false;
};

struct EnvelopeState {
  Size expandedSize;
  bool expandedSizeInitialized = false;
  std::optional<Rect> resizeFrozenEnvelope;
};

struct EnvelopeResult {
  Rect frame;
  bool captureActualPanelFrame = false;
};

struct ItemFrame {
  std::size_t originalIndex = 0;
  Rect frame;
  std::optional<std::size_t> zIndex;
  std::optional<double> homeTransitionProgress;
};

struct MotionFrames {
  std::vector<ItemFrame> items;
  std::vector<ItemFrame> exitingItems;
  Rect controlReferenceFrame;
  bool controlsVisible = false;
  bool controlsAboveItem = false;
  bool controlsDocked = false;
};

Point appearanceAnchorPoint(std::uint64_t alignment);
Point restOffset(Size size, std::size_t index, std::uint64_t alignment);
Size displaySizeForSourceSize(Size source, double maximumDisplaySize);
bool contributesToStackLayout(const LayoutItem& item, std::size_t index,
                             std::size_t visibleStackItemLimit);
Point currentStackAnchorOrDefault(const std::vector<LayoutItem>& items,
                                 std::size_t visibleStackItemLimit,
                                 std::optional<Point> restAnchorScreenPoint);
Point currentStackAnchorForAlignment(const std::vector<LayoutItem>& items,
                                    std::size_t visibleStackItemLimit,
                                    std::uint64_t alignment,
                                    std::optional<Point> restAnchorScreenPoint);
void updateRestOffsetsForAlignment(std::vector<LayoutItem>& items,
                                  std::size_t visibleStackItemLimit,
                                  std::uint64_t alignment,
                                  std::optional<Point> restAnchorScreenPoint);
Size stackRestSize(const std::vector<LayoutItem>& items,
                   std::size_t visibleStackItemLimit);

Spring motionSpring(std::size_t itemIndex, std::ptrdiff_t leadIndex,
                    bool isLead, bool dragging, bool programmaticMove);
void configureMotionSprings(std::vector<LayoutItem>& items,
                            std::ptrdiff_t leadIndex, bool dragging,
                            bool programmaticMove);
Spring normalizedSpringParameters(SpringParameters parameters);
void configureMotionSpringsWithParameters(std::vector<LayoutItem>& items,
                                         std::vector<LayoutItem>& exitingItems,
                                         SpringParameters parameters);
Point releaseVelocity(Point draggingVelocity, std::size_t itemIndex,
                      std::ptrdiff_t leadIndex, bool isLead);
bool exactStep(MotionState& state, Point anchor, double deltaSeconds);
double motionDeltaSeconds(double timestamp, double previousTimestamp);
void synchronizeMotionOrigin(MotionState& motion, Rect currentFrame,
                             Point panelScreenOrigin);
void reconcileCenteredAlignmentOrigin(MotionState& motion, Size currentFrameSize,
                                      Size displaySize,
                                      std::uint64_t alignment);
void translateMotionOrigins(std::vector<LayoutItem>& items, Point translation);
void placeMotionAtAnchor(MotionState& motion, Point anchor);

std::vector<std::size_t> compatibleHosts(
    const std::vector<Host>& hosts, std::optional<std::size_t> currentHost,
    std::optional<std::size_t> defaultHost,
    const std::vector<std::size_t>& registeredHostOrder, bool includeDragHosts);
std::vector<Anchor> anchorsForHost(const Host& host, std::size_t hostIndex,
                                   double stackDisplayWidth,
                                   double stackRestWidth);
std::vector<Anchor> compatibleAnchors(
    const std::vector<Host>& hosts, std::optional<std::size_t> currentHost,
    std::optional<std::size_t> defaultHost,
    const std::vector<std::size_t>& registeredHostOrder, bool includeDragHosts,
    std::optional<Point> restAnchorScreenPoint, double stackDisplayWidth,
    double stackRestWidth, bool stackWindowAvailable);
std::optional<Anchor> preferredAnchor(const std::vector<Anchor>& anchors,
                                      std::uint64_t currentAlignment);
std::optional<Anchor> preferredCompatibleAnchor(
    const std::vector<Anchor>& anchors,
    std::optional<std::uint64_t> preferredAlignment);
Anchor fallbackAnchor(std::optional<Point> restAnchorScreenPoint,
                      std::optional<std::size_t> currentHost);
bool includesDragHosts(bool dragHasMoved, Point currentDragVelocity);
AnchorSelection nearestTargetAnchor(
    Point currentAnchor, std::optional<Point> draggingVelocity,
    const std::vector<Anchor>& candidates, const std::vector<Host>& hosts,
    std::optional<std::string> currentHostID, Anchor fallback);

Point programmaticMoveControlPoint(Point start, const Anchor& target,
                                   bool targetHostHasCodexHome);
ProgrammaticMove beginProgrammaticMove(
    Point start, Anchor target, double startTimestamp,
    bool windowHiddenForDOMVideo, bool targetHostHasCodexHome,
    std::uintptr_t currentOwnerWindowIdentity,
    std::uintptr_t targetOwnerWindowIdentity);
bool updateProgrammaticMove(ProgrammaticMove& move, double timestamp,
                           Anchor& currentTargetAnchor);
double programmaticMoveProgress(const ProgrammaticMove& move,
                                double lastMotionTimestamp);
Size renderedSize(Size displaySize, const MotionState* motion,
                  const ProgrammaticMove* move, double lastMotionTimestamp);
double homeTransitionProgress(double targetProgress, const MotionState& motion,
                              const ProgrammaticMove* move,
                              double lastMotionTimestamp);
Point motionStepAnchor(Point currentTargetAnchor, const LayoutItem& item,
                       std::size_t originalIndex, std::uint64_t alignment,
                       const ProgrammaticMove* move, double lastMotionTimestamp,
                       bool programmaticMoveUpdated);

double snapToBackingScale(double value, double backingScale);
Point snapPointToBackingScale(Point point, double backingScale);
Rect clampEnvelopeToVisibleScreen(Rect envelope,
                                  std::optional<Rect> visibleScreenFrame,
                                  double backingScale);
std::optional<Rect> motionContentEnvelope(
    const std::vector<LayoutItem>& items,
    const std::vector<LayoutItem>& exitingItems,
    std::size_t visibleStackItemLimit, const ProgrammaticMove* move,
    double lastMotionTimestamp);
Rect resizeFrozenEnvelope(Rect contentEnvelope, double overscan,
                          std::size_t visibleCount, std::size_t exitingCount,
                          std::uint64_t resizeAlignment,
                          std::uint64_t currentAlignment,
                          std::optional<Point> frozenAnchorScreenPoint,
                          std::optional<Rect> visibleScreenFrame,
                          double backingScale);
EnvelopeResult motionEnvelope(Rect contentEnvelope, bool expanded,
                              bool resizing, std::size_t visibleCount,
                              std::size_t exitingCount,
                              std::uint64_t resizeAlignment,
                              std::uint64_t currentAlignment,
                              std::optional<Point> frozenAnchorScreenPoint,
                              std::optional<Rect> visibleScreenFrame,
                              double backingScale, EnvelopeState& state);
MotionFrames applyMotionFrames(const std::vector<LayoutItem>& items,
                              const std::vector<LayoutItem>& exitingItems,
                              std::size_t visibleStackItemLimit,
                              Point actualPanelScreenOrigin,
                              const Anchor* currentTargetAnchor,
                              const std::vector<Host>& hosts,
                              const ProgrammaticMove* move,
                              double lastMotionTimestamp, bool expanded);

}  // namespace opencu::pip

#endif
