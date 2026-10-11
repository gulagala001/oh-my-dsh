#import "ComputerUse.h"

void CUEnforceInputFocus(CUSession *session, CUWindow *target);
// A NULL captured window is preserved, without resolving a fresh AX window.
void CUEnforceInputFocusForAXWindow(CUSession *session, CUWindow *target, AXUIElementRef window);
BOOL CUInputFocusBelievesFocused(CUSession *session, CUWindow *target);
void CUInputFocusActionPerformed(CUSession *session, CUWindow *target);
void CUWithTransientInputFocus(CUSession *session, CUWindow *target, void (^perform)(void));
void CUInputFocusSuppressMenu(CUSession *session, CUWindow *target, NSNumber *menuPid);
void CUInputFocusStopSuppressingMenu(CUSession *session, CUWindow *target);
// Notification delivery only uses an existing controller and the element's actual AX PID.
BOOL CUInputFocusHandleAXNotification(CUSession *session, pid_t pid, NSString *processIdentity,
                                     CFStringRef notification, AXUIElementRef element);
BOOL CUDeactivateInputFocus(CUWindow *target);
BOOL CUCloseInputFocus(CUSession *session);
