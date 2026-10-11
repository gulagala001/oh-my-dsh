#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

@class CUSession;
@class CUWindow;

NS_ASSUME_NONNULL_BEGIN

typedef void (^CUWindowRegistryChangeHandler)(pid_t pid, NSString *processIdentity);
typedef BOOL (^CUWindowRegistryControlProvider)(pid_t pid);
typedef BOOL (^CUWindowRegistryNotificationHandler)(pid_t pid, NSString *processIdentity,
                                                    CFStringRef notification, AXUIElementRef element);
void CUWindowRegistrySetChangeHandler(CUWindowRegistryChangeHandler _Nullable handler);
void CUWindowRegistrySetControlProvider(CUWindowRegistryControlProvider _Nullable provider);
void CUWindowRegistrySetNotificationHandler(CUWindowRegistryNotificationHandler _Nullable handler);
BOOL CUWindowRegistryCancelOperations(CUSession *session);
BOOL CUWindowRegistryHasFocusedMenuBarItem(CUWindow *target);
AXUIElementRef _Nullable CUWindowRegistryCopyLastCaptureWindow(CUWindow *target) CF_RETURNS_RETAINED;
void CUWindowRegistryDidPrepareMenu(CUWindow *target, AXUIElementRef menuBarItem, AXUIElementRef menu);
// Only a completed source AX capture may change lastWindow.
void CUWindowRegistryDidCapture(CUWindow *target, AXUIElementRef _Nullable selectedWindow);
NSDictionary *_Nullable CUWindowRegistryContext(CUWindow *target, NSString *_Nullable threadID,
                                                NSString *_Nullable turnID, NSArray<NSNumber *> *presentationWindowIDs);
NSDictionary *_Nullable CUWindowRegistryPrimaryWindow(pid_t pid, NSString *processIdentity);
void CUWindowRegistryEndTurn(NSString *threadID, NSString *turnID);
void CUWindowRegistryClose(void);

NS_ASSUME_NONNULL_END
