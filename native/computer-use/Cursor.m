#import "ComputerUse.h"
#import <unistd.h>

static double CUNow(void) { return NSProcessInfo.processInfo.systemUptime; }
static NSHashTable *visibleCursors;
static void CUCursorMain(dispatch_block_t action, BOOL wait) {
  if(NSThread.isMainThread){action();return;}
  dispatch_semaphore_t done=wait?dispatch_semaphore_create(0):nil;
  CFRunLoopPerformBlock(CFRunLoopGetMain(),kCFRunLoopCommonModes,^{action();if(done)dispatch_semaphore_signal(done);});
  CFRunLoopWakeUp(CFRunLoopGetMain());
  if(done)dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);
}

@interface CUCursorPanel : NSPanel
@end
@implementation CUCursorPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

@interface CUCursorView : NSView
@property CGPoint point;
@property CGPoint press;
@property BOOL down;
@property double pulse;
@end
@implementation CUCursorView
- (BOOL)isFlipped { return YES; }
- (BOOL)isOpaque { return NO; }
- (BOOL)isAccessibilityElement { return NO; }
- (void)drawRect:(NSRect)dirty {
  [NSGraphicsContext saveGraphicsState];
  [NSColor.clearColor setFill];NSRectFillUsingOperation(self.bounds,NSCompositingOperationCopy);
  if(self.pulse>=0&&self.pulse<1){
    CGFloat radius=4+10*self.pulse;
    NSBezierPath *ring=[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(self.press.x-radius,self.press.y-radius,2*radius,2*radius)];
    [[NSColor colorWithRed:.22 green:.49 blue:.86 alpha:.5*(1-self.pulse)] setStroke];ring.lineWidth=3;[ring stroke];
    [[NSColor colorWithWhite:1 alpha:.9*(1-self.pulse)] setStroke];ring.lineWidth=2;[ring stroke];
  }
  NSAffineTransform *transform=[NSAffineTransform transform];[transform translateXBy:self.point.x yBy:self.point.y];[transform scaleBy:self.down?.9:1];[transform concat];
  NSShadow *shadow=[NSShadow new];shadow.shadowColor=[NSColor colorWithWhite:0 alpha:.32];shadow.shadowBlurRadius=3;shadow.shadowOffset=NSMakeSize(0,-2);[shadow set];
  NSBezierPath *arrow=[NSBezierPath bezierPath];[arrow moveToPoint:NSMakePoint(0,0)];[arrow lineToPoint:NSMakePoint(17,12.5)];[arrow lineToPoint:NSMakePoint(9.6,13.5)];[arrow lineToPoint:NSMakePoint(5.7,20.5)];[arrow closePath];
  [[NSColor colorWithRed:23./255 green:25./255 blue:28./255 alpha:1] setFill];[arrow fill];
  [NSColor.whiteColor setStroke];arrow.lineWidth=2;arrow.lineJoinStyle=NSLineJoinStyleRound;[arrow stroke];
  [NSGraphicsContext restoreGraphicsState];
}
@end

@interface CUCursor : NSObject
@property (weak) CUSession *session;
@property NSString *label;
@property NSString *identity;
@property pid_t pid;
@property CGWindowID target;
@property CGPoint local;
@property CGPoint press;
@property BOOL down;
@property double updated;
@property double updatedWall;
@property CGRect bounds;
@property double pressed;
@property CUCursorPanel *panel;
@property CUCursorView *view;
@property NSTimer *timer;
- (void)hide;
- (void)refresh;
@end
@implementation CUCursor
- (void)hide {
  [self.timer invalidate];self.timer=nil;
  if(self.panel){
    CUSession *session=self.session;if(!session.retiredCursorWindows)session.retiredCursorWindows=[NSMutableSet new];
    [session.retiredCursorWindows addObject:@(self.panel.windowNumber)];
  }
  [self.panel orderOut:nil];[self.panel close];self.panel=nil;self.view=nil;
}
- (void)refresh {
  CUSession *session=self.session;
  if(!session||atomic_load(&session->cancelled)||![session.label isEqual:self.label]||CUNow()-self.updated>1.5){[self hide];return;}
  @try { if(![CUIdentity(self.pid) isEqual:self.identity]){[self hide];return;} }
  @catch(NSException *error){[self hide];return;}
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,kCGNullWindowID));
  NSDictionary *target=nil;NSUInteger targetIndex=NSNotFound,cursorIndex=NSNotFound;
  for(NSUInteger i=0;i<windows.count;i++){
    NSDictionary *window=windows[i];CGWindowID wid=[window[(id)kCGWindowNumber] unsignedIntValue];
    if(wid==self.target&&[window[(id)kCGWindowOwnerPID] intValue]==self.pid){target=window;targetIndex=i;}
    if(self.panel&&wid==self.panel.windowNumber)cursorIndex=i;
  }
  CGRect bounds;
  if(!target||!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)target[(id)kCGWindowBounds],&bounds)||self.local.x<0||self.local.y<0||self.local.x>=bounds.size.width||self.local.y>=bounds.size.height){[self hide];return;}
  self.bounds=bounds;
  CGPoint point=CGPointMake(bounds.origin.x+self.local.x,bounds.origin.y+self.local.y),press=CGPointMake(bounds.origin.x+self.press.x,bounds.origin.y+self.press.y);
  double pulse=(CUNow()-self.pressed)/.25;
  CGRect frame=CGRectMake(point.x-16,point.y-16,48,52);
  if(pulse>=0&&pulse<1)frame=CGRectUnion(frame,CGRectMake(press.x-16,press.y-16,32,32));
  frame=CGRectIntersection(frame,bounds);if(CGRectIsEmpty(frame)){[self hide];return;}
  if(!self.panel){
    self.panel=[[CUCursorPanel alloc]initWithContentRect:NSZeroRect styleMask:NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:NO];
    self.panel.title=@"Trisoul assistant cursor";self.panel.opaque=NO;self.panel.backgroundColor=NSColor.clearColor;self.panel.hasShadow=NO;
    self.panel.ignoresMouseEvents=YES;self.panel.hidesOnDeactivate=NO;self.panel.releasedWhenClosed=NO;self.panel.animationBehavior=NSWindowAnimationBehaviorNone;
    self.panel.floatingPanel=NO;
    self.panel.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorIgnoresCycle;
    self.view=[[CUCursorView alloc]initWithFrame:NSZeroRect];self.panel.contentView=self.view;
  }
  self.panel.level=[target[(id)kCGWindowLayer] integerValue];
  CGFloat top=NSMaxY(NSScreen.screens.firstObject.frame);
  [self.panel setFrame:NSMakeRect(frame.origin.x,top-CGRectGetMaxY(frame),frame.size.width,frame.size.height) display:NO];
  // Account for AppKit's backing-pixel rounding when locating the hotspot.
  NSRect actual=self.panel.frame;CGFloat actualTop=top-NSMaxY(actual);
  self.view.point=CGPointMake(point.x-actual.origin.x,point.y-actualTop);
  self.view.press=CGPointMake(press.x-actual.origin.x,press.y-actualTop);self.view.down=self.down;self.view.pulse=pulse;
  [self.view setNeedsDisplay:YES];[self.panel displayIfNeeded];
  if(cursorIndex==NSNotFound||cursorIndex+1!=targetIndex)[self.panel orderWindow:NSWindowAbove relativeTo:self.target];
}
@end

void CUCursorUpdate(CUSession *session,CUWindow *target,CGPoint local,CUCursorPhase phase) {
  if(atomic_load(&session->cancelled))return;
  NSString *label=[session.label copy],*identity=[target.processIdentity copy];pid_t pid=target.pid;CGWindowID window=target.windowId;double issued=CUNow(),issuedWall=[[NSDate date]timeIntervalSince1970]*1000;
  CUCursorMain(^{
    if(atomic_load(&session->cancelled)||![session.label isEqual:label]||CUNow()-issued>1.5)return;
    CUCursor *cursor=session.cursor;
    if(!cursor){cursor=[CUCursor new];cursor.session=session;session.cursor=cursor;if(!visibleCursors)visibleCursors=[NSHashTable weakObjectsHashTable];[visibleCursors addObject:cursor];}
    if(cursor.target!=window||cursor.pid!=pid){[cursor hide];cursor.pressed=0;cursor.down=NO;}
    cursor.label=label;cursor.identity=identity;cursor.pid=pid;cursor.target=window;cursor.local=local;cursor.updated=issued;cursor.updatedWall=issuedWall;
    if(phase==CUCursorDown||phase==CUCursorClick){cursor.press=local;cursor.pressed=issued;cursor.down=phase==CUCursorDown;}
    if(phase==CUCursorUp)cursor.down=NO;
    @try{[cursor refresh];} @catch(NSException *error){[cursor hide];return;}
    if(cursor.panel&&!cursor.timer){
      __weak CUCursor *weak=cursor;
      cursor.timer=[NSTimer timerWithTimeInterval:1./60 repeats:YES block:^(NSTimer *timer){CUCursor *strong=weak;if(!strong){[timer invalidate];return;}@try{[strong refresh];}@catch(NSException *error){[strong hide];}}];
      [NSRunLoop.mainRunLoop addTimer:cursor.timer forMode:NSRunLoopCommonModes];
    }
  },NO);
}
NSDictionary *CUCursorSnapshot(pid_t pid,CGWindowID window){
  __block NSDictionary *result;
  CUCursorMain(^{for(CUCursor *cursor in visibleCursors.allObjects){
    CUSession *session=cursor.session;
    if(cursor.pid!=pid||cursor.target!=window||!cursor.panel||!session||atomic_load(&session->cancelled)||CUNow()-cursor.updated>1.5)continue;
    CGRect bounds=cursor.bounds;
    NSMutableDictionary *value=[@{@"source":cursor.label,@"sequence":@(llround(cursor.updated*1000000)),@"x":@(cursor.local.x),@"y":@(cursor.local.y),@"buttons":@(cursor.down?1:0),@"geometry":@{@"x":@(bounds.origin.x),@"y":@(bounds.origin.y),@"width":@(bounds.size.width),@"height":@(bounds.size.height)}}mutableCopy];
    value[@"at"]=@(cursor.updatedWall);
    if(CUNow()-cursor.pressed<.25)value[@"press"]=@{@"sequence":@(llround(cursor.pressed*1000000)),@"x":@(cursor.press.x),@"y":@(cursor.press.y)};
    result=value;break;
  }},YES);return result;
}
BOOL CUCursorHide(CUSession *session,NSString *label,BOOL wait) {
  __block NSSet<NSNumber *> *retired;
  CUCursorMain(^{CUCursor *cursor=session.cursor;if(cursor&&[cursor.label isEqual:label]){[cursor hide];session.cursor=nil;}if(wait)retired=[session.retiredCursorWindows copy];},wait);
  if(!wait||!retired.count)return YES;
  // AppKit returning from close/orderOut does not establish that WindowServer
  // has removed the surface. Stop acknowledges the actual on-screen boundary.
  double deadline=CUNow()+.5;
  for(;;){
    NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,kCGNullWindowID));BOOL visible=NO;
    for(NSDictionary *window in windows)if([window[(id)kCGWindowOwnerPID]intValue]==getpid()&&[retired containsObject:window[(id)kCGWindowNumber]]){visible=YES;break;}
    if(windows&&!visible){CUCursorMain(^{[session.retiredCursorWindows minusSet:retired];},YES);return YES;}
    if(CUNow()>=deadline||NSThread.isMainThread)return NO;
    usleep(8000);
  }
}
