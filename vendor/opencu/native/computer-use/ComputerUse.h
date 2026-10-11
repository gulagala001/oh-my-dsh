#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <stdatomic.h>

#ifndef TRISOUL_BUILD_ID
#define TRISOUL_BUILD_ID "development"
#define TRISOUL_VERSION "development"
#define TRISOUL_PROTOCOL 1
#endif

@class CUCursor;
@class CUPreview;
@class CUPreviewBridge;

@interface CUElement : NSObject
@property (assign) AXUIElementRef ax;
@property NSString *identifier;
- (instancetype)initWithElement:(AXUIElementRef)element;
@end

@interface CUWindow : NSObject
@property pid_t pid;
@property CGWindowID windowId;
@property NSString *processIdentity;
@property CGRect bounds;
@property double screenshotScale;
@property CGRect screenshotBounds;
@property CGRect sourceVisibleRect;
@property double sourcePointsPerPixel;
@property(strong) NSNumber *sourceAXDiffingEnabled;
@property NSString *snapshotId;
@property BOOL accessibilityRequested;
@property BOOL webAccessibility;
@property BOOL syntheticFocusHeld;
@property int64_t clickGroup;
@property NSMutableDictionary<NSNumber *, CUElement *> *elements;
@end

@interface CUSession : NSObject {
@public _Atomic(bool) cancelled;
}
@property (readonly,copy) NSString *ownerID;
@property NSString *label;
@property NSString *threadID;
@property NSMutableDictionary<NSString *, CUWindow *> *windows;
@property dispatch_group_t active;
@property dispatch_queue_t queue;
@property NSLock *writeLock;
@property dispatch_queue_t notificationQueue;
@property int socket;
@property BOOL stopping;
@property BOOL cleanupRunning;
@property BOOL disconnected;
@property uint64_t lifecycleGeneration;
@property NSMutableArray<NSDictionary *> *stopRequests;
@property (strong) CUCursor *cursor;
@property NSMutableSet<NSNumber *> *retiredCursorWindows;
@property CUPreview *preview;
@property (strong) CUPreviewBridge *previewBridge;
- (void)check;
@end

void CUFail(NSString *code, NSString *message);
id CUAX(AXUIElementRef element, CFStringRef attribute);
NSString *CUIdentity(pid_t pid);
NSArray *CUApps(void);
NSArray *CUWindows(NSNumber *pid);
CUWindow *CUResolveWindow(CUSession *session, NSDictionary *args);
NSDictionary *CUObserve(CUSession *session, NSDictionary *args);
CUElement *CURefetchRecordedElement(CUSession *session, CUWindow *target, CUElement *observed, BOOL validateElement, BOOL ignoreValueChange);
BOOL CURecordedAXTitle(CUWindow *target, AXUIElementRef element, NSString **title);
BOOL CUHasRecordedAXCapture(CUWindow *target);
BOOL CURecordedSourceTextRange(CUWindow *target, AXUIElementRef element, NSString *text, NSString *prefix, NSString *suffix, NSRange *range);
BOOL CUReleaseInputFocus(CUWindow *target);
NSDictionary *CUInput(CUSession *session, NSString *name, NSDictionary *args);
NSDictionary *CUPaste(CUSession *session, NSDictionary *args, AXUIElementRef focused, void (^deliver)(void));
NSDictionary *CUResult(id value);
CGWindowID CUAXWindowId(AXUIElementRef element);

typedef NS_ENUM(NSInteger, CUCursorPhase) { CUCursorMove, CUCursorDown, CUCursorUp, CUCursorClick };
void CUCursorUpdate(CUSession *session, CUWindow *target, CGPoint local, CUCursorPhase phase);
BOOL CUCursorGetPosition(CUSession *session, CUWindow *target, CGPoint *position);
BOOL CUCursorMoveTo(CUSession *session, CUWindow *target, CGPoint local, NSInteger nextInteractionTiming, BOOL animated);
void CUCursorSetPetLocation(CUSession *session, CGPoint globalCocoaPoint, BOOL available);
BOOL CUCursorHide(CUSession *session, NSString *label, BOOL wait);
NSDictionary *CUCursorSnapshot(pid_t pid, CGWindowID window, NSString *ownerSessionLabel);
FOUNDATION_EXPORT NSNotificationName const CUCursorCaptureSourceDidChangeNotification;
NSDictionary *CUCursorCaptureSource(pid_t targetPID, CGWindowID targetWindowId, NSString *ownerSessionLabel);
BOOL CUCursorCaptureSourceIsCurrent(NSDictionary *source);
NSDictionary *CUStartPreview(CUSession *session, NSDictionary *args);
NSDictionary *CUReadPreview(CUSession *session, NSDictionary *args);
BOOL CUStopPreview(CUSession *session);
