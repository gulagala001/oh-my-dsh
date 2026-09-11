#import "ComputerUse.h"
#import <dlfcn.h>
#import <unistd.h>

// The process/window event fields follow Cua Driver 0.26.1's documented
// SkyLight mapping (MIT). No OpenAI implementation is included here.
static void *CUSymbol(const char *name) {
  static dispatch_once_t once;dispatch_once(&once,^{dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_GLOBAL);});
  return dlsym(RTLD_DEFAULT,name);
}
static void CUStamp(CGEventRef event,CUWindow *target,CGPoint local,int count,int button) {
  typedef void(*SetInteger)(CGEventRef,uint32_t,int64_t);typedef void(*SetLocation)(CGEventRef,CGPoint);
  SetInteger set=CUSymbol("SLEventSetIntegerValueField");SetLocation location=CUSymbol("CGEventSetWindowLocation");
  if(!set||!location)CUFail(@"BACKGROUND_UNAVAILABLE",@"Window-directed events are unavailable on this macOS version.");
  location(event,local);set(event,40,target.pid);set(event,51,target.windowId);set(event,91,target.windowId);set(event,92,target.windowId);
  if(CGEventGetType(event)!=kCGEventScrollWheel){set(event,1,count);set(event,3,button);set(event,7,target.webAccessibility?3:0);if(target.webAccessibility){set(event,0,CGEventGetType(event)==kCGEventMouseMoved?2:3);set(event,58,target.clickGroup);}}
  CGEventSetIntegerValueField(event,kCGEventSourceUserData,0x545249534f554c);
}
static void CUPost(CGEventRef event,CUWindow *target,BOOL pointer) {
  // Use one delivery path per event: double-posting creates duplicate input.
  // The public process-directed path also reaches an inactive AppKit window.
  if(target.webAccessibility){
    typedef void(*Post)(pid_t,CGEventRef);Post post=CUSymbol("SLEventPostToPid");
    if(post){post(target.pid,event);return;}
  }
  CGEventPostToPid(target.pid,event);
}
static CGPoint CUPoint(NSDictionary *args,NSString *xKey,NSString *yKey,CUWindow *target) {
  if(target.screenshotScale<=0)CUFail(@"STALE_SCREENSHOT",@"Capture the current window before using coordinates; it may have moved or resized.");
  id x=args[xKey],y=args[yKey];if(![x isKindOfClass:NSNumber.class]||![y isKindOfClass:NSNumber.class]||!isfinite([x doubleValue])||!isfinite([y doubleValue]))CUFail(@"INVALID_POINT",@"Finite screenshot x and y coordinates are required.");
  CGPoint p=CGPointMake([x doubleValue]/target.screenshotScale,[y doubleValue]/target.screenshotScale);
  if(p.x<0||p.y<0||p.x>=target.bounds.size.width||p.y>=target.bounds.size.height)CUFail(@"POINT_OUTSIDE_WINDOW",@"The point lies outside the observed target window.");return p;
}
static void CUMouse(CUSession *session,CUWindow *target,CGEventType type,CGPoint local,int count,CGMouseButton button) {
  CGPoint screen=CGPointMake(target.bounds.origin.x+local.x,target.bounds.origin.y+local.y);
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);CGEventRef event=CGEventCreateMouseEvent(source,type,screen,button);CFRelease(source);
  if(!event)CUFail(@"INPUT_FAILED",@"Could not create the pointer event.");
  @try{CUStamp(event,target,local,count,button);CUPost(event,target,YES);}@finally{CFRelease(event);}
  CUCursorPhase phase=(type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown||type==kCGEventOtherMouseDown)?CUCursorDown:(type==kCGEventLeftMouseUp||type==kCGEventRightMouseUp||type==kCGEventOtherMouseUp)?CUCursorUp:CUCursorMove;
  CUCursorUpdate(session,target,local,phase);
}
static void CUCursorElement(CUSession *session,CUWindow *target,AXUIElementRef element) {
  id position=CUAX(element,kAXPositionAttribute),size=CUAX(element,kAXSizeAttribute);CGPoint p;CGSize s;
  if(!position||!size||CFGetTypeID((__bridge CFTypeRef)position)!=AXValueGetTypeID()||CFGetTypeID((__bridge CFTypeRef)size)!=AXValueGetTypeID()||!AXValueGetValue((__bridge AXValueRef)position,kAXValueCGPointType,&p)||!AXValueGetValue((__bridge AXValueRef)size,kAXValueCGSizeType,&s))return;
  CGRect visible=CGRectIntersection(CGRectMake(p.x,p.y,s.width,s.height),target.bounds);if(CGRectIsEmpty(visible))return;
  CUCursorUpdate(session,target,CGPointMake(CGRectGetMidX(visible)-target.bounds.origin.x,CGRectGetMidY(visible)-target.bounds.origin.y),CUCursorClick);
}
static AXUIElementRef CUElementFor(CUSession *session,CUWindow *target,NSDictionary *args) {
  [session check];NSString *token=args[@"element_token"];NSNumber *index=args[@"element_index"];
  if(token){
    if(![token isKindOfClass:NSString.class])CUFail(@"INVALID_ELEMENT",@"Element token must be a string from the observation.");
    NSArray *parts=[token componentsSeparatedByString:@":"];
    if(parts.count!=2||![parts[0] isEqualToString:target.snapshotId])CUFail(@"STALE_ELEMENT",@"Read the current window state before acting on this element.");
    NSScanner *scanner=[NSScanner scannerWithString:parts[1]];scanner.charactersToBeSkipped=nil;unsigned long long value;
    if(![scanner scanUnsignedLongLong:&value]||!scanner.isAtEnd)CUFail(@"INVALID_ELEMENT",@"Malformed element token.");index=@(value);
  }
  if(![index isKindOfClass:NSNumber.class]||index.doubleValue!=index.unsignedIntegerValue)CUFail(@"INVALID_ELEMENT",@"Element index must be a nonnegative integer from the observation.");
  CUElement *element=target.elements[index];if(!element)CUFail(@"STALE_ELEMENT",@"The element is absent from the latest observation.");
  pid_t pid=0;if(AXUIElementGetPid(element.ax,&pid)!=kAXErrorSuccess||pid!=target.pid)CUFail(@"STALE_ELEMENT",@"The element no longer belongs to the selected process.");
  AXUIElementRef window=(__bridge AXUIElementRef)CUAX(element.ax,kAXWindowAttribute);
  if(window&&CUAXWindowId(window)!=target.windowId)CUFail(@"WRONG_WINDOW",@"The element moved to another window.");
  if(!CUAX(element.ax,kAXRoleAttribute))CUFail(@"STALE_ELEMENT",@"The observed element was removed.");return element.ax;
}
static void CUSleep(CUSession *session,NSUInteger milliseconds) {
  for(NSUInteger elapsed=0;elapsed<milliseconds;elapsed+=8){[session check];usleep((useconds_t)MIN(8,milliseconds-elapsed)*1000);}
}
static void CUWebPrime(CUSession *session,CUWindow *target){
  // Chromium's background user-activation handshake, scoped to this window.
  // The primer is off-surface and never changes the physical pointer.
  typedef void(*Set)(CGEventRef,uint32_t,int64_t);Set set=CUSymbol("SLEventSetIntegerValueField");
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);
  CGEventRef down=CGEventCreateMouseEvent(source,kCGEventLeftMouseDown,CGPointMake(-1,-1),kCGMouseButtonLeft);
  CGEventRef up=CGEventCreateMouseEvent(source,kCGEventLeftMouseUp,CGPointMake(-1,-1),kCGMouseButtonLeft);CFRelease(source);
  if(!down||!up){if(down)CFRelease(down);if(up)CFRelease(up);CUFail(@"INPUT_FAILED",@"Could not prepare the selected web window for input.");}
  BOOL sent=NO;
  @try{CUStamp(down,target,CGPointMake(-1,-1),1,0);set(down,0,1);CUStamp(up,target,CGPointMake(-1,-1),1,0);set(up,0,2);[session check];CUPost(down,target,YES);sent=YES;CUSleep(session,1);}
  @finally{if(sent)CUPost(up,target,YES);CFRelease(down);CFRelease(up);}
  CUSleep(session,100);
}
static CGRect CUElementBounds(AXUIElementRef element) {
  id position=CUAX(element,kAXPositionAttribute),size=CUAX(element,kAXSizeAttribute);CGPoint p;CGSize s;
  if(!position||!size||CFGetTypeID((__bridge CFTypeRef)position)!=AXValueGetTypeID()||CFGetTypeID((__bridge CFTypeRef)size)!=AXValueGetTypeID()||!AXValueGetValue((__bridge AXValueRef)position,kAXValueCGPointType,&p)||!AXValueGetValue((__bridge AXValueRef)size,kAXValueCGSizeType,&s)||!isfinite(p.x)||!isfinite(p.y)||!isfinite(s.width)||!isfinite(s.height)||s.width<=0||s.height<=0)return CGRectNull;
  return CGRectMake(p.x,p.y,s.width,s.height);
}
static id CUScrollArea(CUSession *session,AXUIElementRef element) {
  id current=(__bridge id)element;
  for(NSUInteger i=0;current&&i<64;i++){
    [session check];AXUIElementRef ax=(__bridge AXUIElementRef)current;AXUIElementSetMessagingTimeout(ax,.25);
    NSString *role=CUAX(ax,kAXRoleAttribute);if([role isEqual:(__bridge NSString *)kAXScrollAreaRole])return current;
    if([role isEqual:(__bridge NSString *)kAXWindowRole])break;
    current=CUAX(ax,kAXParentAttribute);
  }return nil;
}
static id CUHit(CUWindow *target,AXUIElementRef app,CGPoint screen) {
  AXUIElementRef hit=NULL;if(AXUIElementCopyElementAtPosition(app,screen.x,screen.y,&hit)!=kAXErrorSuccess||!hit)return nil;
  id owned=CFBridgingRelease(hit);AXUIElementSetMessagingTimeout(hit,.25);
  AXUIElementRef window=(__bridge AXUIElementRef)CUAX(hit,kAXWindowAttribute);
  return window&&CUAXWindowId(window)==target.windowId?owned:nil;
}
static CGPoint CUElementPoint(CUSession *session,CUWindow *target,AXUIElementRef element){
  CGRect visible=CGRectIntersection(CUElementBounds(element),target.bounds);
  if(CGRectIsNull(visible)||CGRectIsEmpty(visible))CUFail(@"ELEMENT_NOT_VISIBLE",@"The observed element has no visible input surface in this window.");
  AXUIElementRef app=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(app,.25);
  @try{
    for(NSNumber *fy in @[@.5,@.25,@.75])for(NSNumber *fx in @[@.5,@.25,@.75]){
      [session check];CGPoint point=CGPointMake(visible.origin.x+visible.size.width*fx.doubleValue,visible.origin.y+visible.size.height*fy.doubleValue);
      id hit=CUHit(target,app,point);
      for(NSUInteger i=0;hit&&i<64;i++){
        AXUIElementRef current=(__bridge AXUIElementRef)hit;if(CFEqual(current,element))return CGPointMake(point.x-target.bounds.origin.x,point.y-target.bounds.origin.y);
        if([CUAX(current,kAXRoleAttribute)isEqual:(__bridge NSString *)kAXWindowRole])break;hit=CUAX(current,kAXParentAttribute);
      }
    }
  }@finally{CFRelease(app);}
  CUFail(@"ELEMENT_OBSCURED",@"The observed element is covered or no longer receives input at its visible bounds.");return CGPointZero;
}
static void CUWheel(CUSession *session,CUWindow *target,CGPoint local,int32_t dx,int32_t dy) {
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);
  CGEventRef event=CGEventCreateScrollWheelEvent2(source,kCGScrollEventUnitPixel,2,dy,dx,0);CFRelease(source);
  if(!event)CUFail(@"INPUT_FAILED",@"Could not create the scroll event.");
  @try{
    CGEventSetLocation(event,CGPointMake(target.bounds.origin.x+local.x,target.bounds.origin.y+local.y));
    CUStamp(event,target,local,0,0);
    CUPost(event,target,YES);
  }@finally{CFRelease(event);}
  CUCursorUpdate(session,target,local,CUCursorMove);
}
static NSDictionary *CUScroll(CUSession *session,CUWindow *target,NSDictionary *args,AXUIElementRef element) {
  NSString *direction=args[@"direction"];
  if(![@[@"up",@"down",@"left",@"right"]containsObject:direction])CUFail(@"INVALID_SCROLL",@"Scroll direction must be up, down, left, or right.");
  id amount=args[@"amount"]?:@1;
  if(![amount isKindOfClass:NSNumber.class]||!isfinite([amount doubleValue])||[amount doubleValue]<0)CUFail(@"INVALID_SCROLL",@"Scroll pages must be a finite nonnegative number.");
  if(args[@"by"]&&![args[@"by"]isEqual:@"page"])CUFail(@"INVALID_SCROLL",@"Native scroll amounts use pages.");
  CGPoint local=element?CGPointZero:CUPoint(args,@"x",@"y",target);
  AXUIElementRef application=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(application,.25);
  CGRect viewport=target.bounds;id area=nil;
  @try{
    CGPoint screen=CGPointMake(target.bounds.origin.x+local.x,target.bounds.origin.y+local.y);
    id hit=element?(__bridge id)element:CUHit(target,application,screen);
    area=hit?CUScrollArea(session,(__bridge AXUIElementRef)hit):nil;
    if(area){CGRect rect=CUElementBounds((__bridge AXUIElementRef)area);if(!CGRectIsNull(rect))viewport=CGRectIntersection(rect,target.bounds);}
    if(element){
      CGRect visible=CGRectIntersection(CUElementBounds(element),viewport);
      if(CGRectIsNull(visible)||CGRectIsEmpty(visible))CUFail(@"SCROLL_TARGET_NOT_VISIBLE",@"The observed scroll target has no visible area in this window.");
      BOOL found=NO;
      // The center of an outer viewport may belong to a nested viewport. Use
      // a point whose actual AX hit belongs to the requested scroll container.
      for(NSNumber *fy in @[@.5,@.1,@.9]){for(NSNumber *fx in @[@.5,@.1,@.9]){
        [session check];CGPoint candidate=CGPointMake(visible.origin.x+visible.size.width*fx.doubleValue,visible.origin.y+visible.size.height*fy.doubleValue);
        id candidateHit=CUHit(target,application,candidate),candidateArea=candidateHit?CUScrollArea(session,(__bridge AXUIElementRef)candidateHit):nil;
        if(!area||(candidateArea&&CFEqual((__bridge CFTypeRef)area,(__bridge CFTypeRef)candidateArea))){screen=candidate;found=YES;break;}
      }if(found)break;}
      if(!found)CUFail(@"SCROLL_TARGET_NOT_VISIBLE",@"The requested scroll container has no exposed input surface. Select its nested scroll area explicitly.");
      local=CGPointMake(screen.x-target.bounds.origin.x,screen.y-target.bounds.origin.y);
    }
  }@finally{CFRelease(application);}
  BOOL horizontal=[direction isEqual:@"left"]||[direction isEqual:@"right"];
  double distance=[amount doubleValue]*(horizontal?viewport.size.width:viewport.size.height)*.9;
  if(!isfinite(distance)||distance>INT32_MAX)CUFail(@"INVALID_SCROLL",@"The requested scroll distance is too large.");
  int32_t total=(int32_t)llround(distance),sign=([direction isEqual:@"down"]||[direction isEqual:@"right"])?-1:1;
  if(!total)return CUResult(@{@"route":@"window_scroll",@"effect":@"unchanged"});
  // One element-addressed wheel carries the requested distance atomically.
  // Splitting it across moving content can put a nested viewport beneath the
  // formerly exposed point and redirect the remaining input to that viewport.
  NSUInteger steps=element?1:MAX(1,MIN(120,(NSUInteger)ceil(distance/60)));int32_t delivered=0;
  // Prime the target's hit-test location without moving the physical pointer.
  // Discrete pixel-wheel events avoid starting AppKit's kinetic gesture loop.
  CUMouse(session,target,kCGEventMouseMoved,local,0,kCGMouseButtonLeft);CUSleep(session,8);
  for(NSUInteger i=1;i<=steps;i++){
    [session check];int32_t next=(int32_t)llround((double)total*i/steps),delta=(next-delivered)*sign;
    CUWheel(session,target,local,horizontal?delta:0,horizontal?0:delta);delivered=next;
    if(i<steps)CUSleep(session,8);
  }
  return CUResult(@{@"route":@"window_scroll",@"effect":@"unverifiable"});
}
static CGKeyCode CUKey(NSString *key) {
  static NSDictionary *codes;static dispatch_once_t once;dispatch_once(&once,^{codes=@{@"a":@0,@"s":@1,@"d":@2,@"f":@3,@"h":@4,@"g":@5,@"z":@6,@"x":@7,@"c":@8,@"v":@9,@"b":@11,@"q":@12,@"w":@13,@"e":@14,@"r":@15,@"y":@16,@"t":@17,@"1":@18,@"2":@19,@"3":@20,@"4":@21,@"6":@22,@"5":@23,@"=":@24,@"9":@25,@"7":@26,@"-":@27,@"8":@28,@"0":@29,@"]":@30,@"o":@31,@"u":@32,@"[":@33,@"i":@34,@"p":@35,@"enter":@36,@"return":@36,@"l":@37,@"j":@38,@"'":@39,@"k":@40,@";":@41,@"\\":@42,@",":@43,@"/":@44,@"n":@45,@"m":@46,@".":@47,@"tab":@48,@"space":@49,@"`":@50,@"backspace":@51,@"escape":@53,@"esc":@53,@"home":@115,@"pageup":@116,@"delete":@117,@"end":@119,@"pagedown":@121,@"left":@123,@"right":@124,@"down":@125,@"up":@126,@"f1":@122,@"f2":@120,@"f3":@99,@"f4":@118,@"f5":@96,@"f6":@97,@"f7":@98,@"f8":@100,@"f9":@101,@"f10":@109,@"f11":@103,@"f12":@111};});
  NSNumber *code=codes[key.lowercaseString];
  if(!code)code=@{@"f13":@105,@"f14":@107,@"f15":@113,@"f16":@106,@"f17":@64,@"f18":@79,@"f19":@80,@"f20":@90,@"help":@114,@"insert":@114,@"kp_decimal":@65,@"kp_multiply":@67,@"kp_add":@69,@"kp_clear":@71,@"kp_divide":@75,@"kp_enter":@76,@"kp_subtract":@78,@"kp_equal":@81,@"kp_0":@82,@"kp_1":@83,@"kp_2":@84,@"kp_3":@85,@"kp_4":@86,@"kp_5":@87,@"kp_6":@88,@"kp_7":@89,@"kp_8":@91,@"kp_9":@92}[key.lowercaseString];
  if(!code)CUFail(@"UNKNOWN_KEY",[NSString stringWithFormat:@"Unsupported key: %@",key]);return code.unsignedShortValue;
}
static CGEventFlags CUFlags(NSArray *modifiers) {
  CGEventFlags flags=0;for(NSString *modifier in modifiers){NSString *m=modifier.lowercaseString;if([@[@"cmd",@"command",@"super",@"meta"] containsObject:m])flags|=kCGEventFlagMaskCommand;else if([@[@"ctrl",@"control"] containsObject:m])flags|=kCGEventFlagMaskControl;else if([@[@"alt",@"option"] containsObject:m])flags|=kCGEventFlagMaskAlternate;else if([m isEqualToString:@"shift"])flags|=kCGEventFlagMaskShift;else if([m isEqual:@"fn"])flags|=kCGEventFlagMaskSecondaryFn;else CUFail(@"UNKNOWN_MODIFIER",@"Unknown keyboard modifier.");}return flags;
}
static void CUKeyEvent(CUWindow *target,CGKeyCode key,CGEventFlags flags,NSString *text,BOOL down) {
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);CGEventRef event=CGEventCreateKeyboardEvent(source,key,down);CFRelease(source);if(!event)CUFail(@"INPUT_FAILED",@"Could not create the keyboard event.");
  CGEventSetFlags(event,flags);CGEventSetIntegerValueField(event,kCGEventSourceUserData,0x545249534f554c);
  if(text){NSUInteger length=text.length;UniChar *buffer=calloc(length,sizeof(UniChar));[text getCharacters:buffer range:NSMakeRange(0,length)];CGEventKeyboardSetUnicodeString(event,length,buffer);free(buffer);}
  @try{CUPost(event,target,NO);}@finally{CFRelease(event);}
}
static void CUKeyboardFlags(CUWindow *target,CGEventFlags flags){
  CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStatePrivate);CGEventRef event=CGEventCreateKeyboardEvent(source,0,YES);CFRelease(source);if(!event)CUFail(@"INPUT_FAILED",@"Could not create the modifier event.");
  CGEventSetType(event,kCGEventFlagsChanged);CGEventSetFlags(event,flags);CGEventSetIntegerValueField(event,kCGEventSourceUserData,0x545249534f554c);
  @try{CUPost(event,target,NO);}@finally{CFRelease(event);}
}
static void CUStroke(CUSession *session,CUWindow *target,CGKeyCode key,CGEventFlags flags,NSString *text){
  [session check];BOOL down=NO;
  @try{CUKeyboardFlags(target,flags);CUKeyEvent(target,key,flags,text,YES);down=YES;CUSleep(session,2);}
  @finally{@try{CUKeyboardFlags(target,0);}@finally{if(down)CUKeyEvent(target,key,flags,text,NO);}}
}
static AXUIElementRef CUFocused(CUWindow *target) {
  AXUIElementRef app=AXUIElementCreateApplication(target.pid);id focused=CUAX(app,kAXFocusedUIElementAttribute);
  // Custom-rendered apps may expose the focused window without exposing an
  // individual responder. Keep window identity mandatory; a missing control
  // alone must not block keyboard shortcuts or coordinate-focused editors.
  if(!focused){
    id window=CUAX(app,kAXFocusedWindowAttribute);CFRelease(app);
    if(!window)return NULL;
    if(CUAXWindowId((__bridge AXUIElementRef)window)!=target.windowId)CUFail(@"NO_TARGET_FOCUS",@"Keyboard focus is in a different window. Select the intended window again.");
    return (AXUIElementRef)CFRetain((__bridge CFTypeRef)window);
  }
  CFRelease(app);AXUIElementRef element=(__bridge AXUIElementRef)focused;AXUIElementRef window=(__bridge AXUIElementRef)CUAX(element,kAXWindowAttribute);
  if(!window||CUAXWindowId(window)!=target.windowId)CUFail(@"NO_TARGET_FOCUS",@"Focus an input in the selected window before typing.");
  return (AXUIElementRef)CFRetain(element);
}
static void CUKeyboardFocus(CUWindow *target,BOOL focused) {
  // Cua Driver's MIT event-record mapping. Only the bound process receives
  // synthetic AppKit focus; no other app is defocused and WindowServer's
  // frontmost process and global pointer are not changed.
  typedef int(*GetPSN)(pid_t,void *);typedef int(*PostRecord)(const void *,const uint8_t *);typedef uint32_t(*RecordLength)(void);
  GetPSN get=CUSymbol("GetProcessForPID");PostRecord post=CUSymbol("SLPSPostEventRecordTo");RecordLength recordLength=CUSymbol("SLSEventRecordLength");uint32_t psn[2]={0};
  if(!get||!post||!recordLength||get(target.pid,psn)!=0)CUFail(@"BACKGROUND_UNAVAILABLE",@"This macOS runtime cannot focus the selected app for background input.");
  // Sonoma reads 256 bytes, including an Objective-C payload in the tail.
  // The common 248-byte recipe reads past its buffer and intermittently crashes
  // inside NSKeyedArchiver. Query this runtime and initialize the entire record.
  uint32_t length=recordLength();if(length!=0xf8&&length!=0x100)CUFail(@"BACKGROUND_UNAVAILABLE",@"This macOS event-record layout is not supported.");
  NSMutableData *storage=[NSMutableData dataWithLength:length];uint8_t *record=storage.mutableBytes;
  uint32_t declared=CFSwapInt32HostToLittle(length);memcpy(record+4,&declared,4);record[8]=0x0d;uint32_t window=CFSwapInt32HostToLittle(target.windowId);memcpy(record+0x3c,&window,4);record[0x8a]=focused?1:2;
  if(post(psn,record)!=0)CUFail(@"BACKGROUND_UNAVAILABLE",@"The selected app refused background input focus.");
  if(focused){
    for(uint8_t kind=1;kind<=2;kind++){
      memset(record,0,length);memcpy(record+4,&declared,4);record[8]=kind;record[0x3a]=0x10;memcpy(record+0x3c,&window,4);memset(record+0x20,0xff,0x10);
      if(post(psn,record)!=0)CUFail(@"BACKGROUND_UNAVAILABLE",@"The selected window refused its keyboard focus status.");
    }
  }
}
static void CUFinishKeyboardFocus(CUWindow *target,BOOL synthetic){
  if(!synthetic||NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==target.pid)return;
  if(target.webAccessibility){target.syntheticFocusHeld=YES;return;}
  CUKeyboardFocus(target,NO);
}
BOOL CUReleaseInputFocus(CUWindow *target){
  if(!target.syntheticFocusHeld)return YES;
  if(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=target.pid&&[CUIdentity(target.pid)isEqual:target.processIdentity]){
    AXUIElementRef app=AXUIElementCreateApplication(target.pid);id window=CUAX(app,kAXFocusedWindowAttribute);CFRelease(app);
    // A newer window may belong to another controller. Never defocus it.
    if(window&&CUAXWindowId((__bridge AXUIElementRef)window)==target.windowId){@try{CUKeyboardFocus(target,NO);}@catch(NSException *error){return NO;}}
  }
  target.syntheticFocusHeld=NO;return YES;
}
static void CUWithKeyboardFocus(CUSession *session,CUWindow *target,void (^deliver)(void)){
  BOOL synthetic=NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=target.pid;
  @try{
    if(synthetic){CUKeyboardFocus(target,YES);CUSleep(session,16);}
    AXUIElementRef focused=CUFocused(target);if(!focused)CUFail(@"NO_TARGET_FOCUS",@"Focus a control in the selected window before keyboard input.");CFRelease(focused);
    [session check];deliver();
  }@finally{CUFinishKeyboardFocus(target,synthetic);}
}
NSDictionary *CUInput(CUSession *session,NSString *name,NSDictionary *args) {
  if(!AXIsProcessTrusted())CUFail(@"ACCESSIBILITY_PERMISSION",@"Enable Accessibility for Trisoul Computer Use.");
  CUWindow *target=CUResolveWindow(session,args);[session check];
  BOOL indexed=args[@"element_index"]||args[@"element_token"];AXUIElementRef element=indexed?CUElementFor(session,target,args):NULL;
  if([name isEqual:@"paste"]){
    AXUIElementRef focused=CUFocused(target);if(!focused)CUFail(@"NO_TARGET_FOCUS",@"Focus an input in the selected window before pasting.");
    __block BOOL synthetic=NO;
    @try{return CUPaste(session,args,focused,^{
      AXUIElementRef current=CUFocused(target);BOOL same=current&&CFEqual(current,focused);if(current)CFRelease(current);
      if(!same)CUFail(@"NO_TARGET_FOCUS",@"Focus changed while preparing paste. Select the intended input again.");
      if(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=target.pid){synthetic=YES;CUKeyboardFocus(target,YES);CUSleep(session,16);}
      current=CUFocused(target);same=current&&CFEqual(current,focused);if(current)CFRelease(current);
      if(!same)CUFail(@"NO_TARGET_FOCUS",@"The input focus changed before paste delivery. Select the intended input again.");
      [session check];CUKeyEvent(target,9,kCGEventFlagMaskCommand,nil,YES);CUKeyEvent(target,9,kCGEventFlagMaskCommand,nil,NO);
    });}@finally{@try{CUFinishKeyboardFocus(target,synthetic);}@finally{CFRelease(focused);}}
  }
  if([name isEqualToString:@"scroll"])return CUScroll(session,target,args,element);
  if([name isEqualToString:@"set_value"]){
    if(!element)CUFail(@"ELEMENT_REQUIRED",@"setValue requires an observed element.");
    id value=args[@"value"]?:@"";id old=CUAX(element,kAXValueAttribute);
    if([old isKindOfClass:NSNumber.class])value=@([value doubleValue]);
    AXError error=AXUIElementSetAttributeValue(element,kAXValueAttribute,(__bridge CFTypeRef)value);
    if(error!=kAXErrorSuccess)CUFail(@"NOT_SETTABLE",[NSString stringWithFormat:@"The control refused its value (AX error %d).",error]);
    // AX success only acknowledges the setter. Controlled editors can revert it
    // on their next update; keep the same element and verify after settling.
    for(NSUInteger sample=0;sample<4;sample++){
      CUSleep(session,100);
      if(![CUAX(element,kAXValueAttribute) isEqual:value])CUFail(@"VALUE_NOT_CONFIRMED",@"The input did not retain the requested value. Read its current state, focus the intended input and use paste/typeText if appropriate; verify the content before sending. The value may have changed; do not blindly repeat this action.");
    }
    return CUResult(@{@"route":@"accessibility",@"effect":@"confirmed"});
  }
  if([name isEqual:@"click"]){
    id count=args[@"count"]?:@1;if(![count isKindOfClass:NSNumber.class]||[count doubleValue]<1||[count doubleValue]>INT32_MAX||[count doubleValue]!=[count longLongValue])CUFail(@"INVALID_CLICK_COUNT",@"Click count must be a positive integer.");
    if(![@[@"left",@"middle",@"right"]containsObject:args[@"button"]?:@"left"])CUFail(@"INVALID_BUTTON",@"Mouse button must be left, middle, or right.");
    id enabled=element?CUAX(element,kAXEnabledAttribute):nil;if([enabled isKindOfClass:NSNumber.class]&&![enabled boolValue])CUFail(@"ELEMENT_DISABLED",@"The observed control is disabled.");
  }
  if([name isEqualToString:@"click"]&&element){
    NSString *action=args[@"action"]?:@"AXPress",*button=args[@"button"]?:@"left";
    if([button isEqualToString:@"right"])action=@"AXShowMenu";
    NSDictionary *aliases=@{@"press":@"AXPress",@"show_menu":@"AXShowMenu",@"confirm":@"AXConfirm",@"cancel":@"AXCancel",@"pick":@"AXPick"};action=aliases[action]?:action;
    NSString *role=CUAX(element,kAXRoleAttribute);
    CFArrayRef available=NULL;AXUIElementCopyActionNames(element,&available);NSArray *actions=available?CFBridgingRelease(available):@[];
    if(args[@"action"]&&![actions containsObject:action])CUFail(@"UNSUPPORTED_ACTION",@"That action is not offered by this observed element.");
    BOOL semantic=args[@"action"]||([args[@"count"]integerValue]<=1&&![button isEqual:@"middle"]&&![@[@"AXTextField",@"AXTextArea"]containsObject:role]&&[actions containsObject:action]);
    if(semantic){
      AXError error=AXUIElementPerformAction(element,(__bridge CFStringRef)action);if(error!=kAXErrorSuccess)CUFail(@"ACTION_FAILED",[NSString stringWithFormat:@"The control refused the action (AX error %d).",error]);
      CUCursorElement(session,target,element);return CUResult(@{@"route":@"accessibility",@"effect":@"unverifiable"});
    }
  }
  if([name isEqualToString:@"click"]||[name isEqualToString:@"drag"]){
    BOOL drag=[name isEqualToString:@"drag"];CGPoint from=element&&!drag?CUElementPoint(session,target,element):CUPoint(args,drag?@"from_x":@"x",drag?@"from_y":@"y",target),to=drag?CUPoint(args,@"to_x",@"to_y",target):from;
    NSString *buttonName=args[@"button"]?:@"left";CGMouseButton button=[buttonName isEqualToString:@"right"]?kCGMouseButtonRight:[buttonName isEqualToString:@"middle"]?kCGMouseButtonCenter:kCGMouseButtonLeft;
    CGEventType down=button==0?kCGEventLeftMouseDown:button==1?kCGEventRightMouseDown:kCGEventOtherMouseDown,up=button==0?kCGEventLeftMouseUp:button==1?kCGEventRightMouseUp:kCGEventOtherMouseUp,moved=button==0?kCGEventLeftMouseDragged:button==1?kCGEventRightMouseDragged:kCGEventOtherMouseDragged;
    NSUInteger count=drag?1:[args[@"count"]unsignedIntegerValue]?:1;
    id inputElement=element?(__bridge id)element:nil;
    if(!inputElement){AXUIElementRef app=AXUIElementCreateApplication(target.pid);AXUIElementSetMessagingTimeout(app,.25);inputElement=CUHit(target,app,CGPointMake(target.bounds.origin.x+from.x,target.bounds.origin.y+from.y));CFRelease(app);}
    BOOL textInput=NO;for(NSUInteger i=0;inputElement&&i<64;i++){
      AXUIElementRef current=(__bridge AXUIElementRef)inputElement;NSString *role=CUAX(current,kAXRoleAttribute);
      if([@[@"AXTextField",@"AXTextArea"]containsObject:role]){textInput=YES;break;}if([role isEqual:(__bridge NSString *)kAXWindowRole])break;inputElement=CUAX(current,kAXParentAttribute);
    }
    BOOL synthetic=textInput&&NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=target.pid;
    @try{
    if(synthetic){CUKeyboardFocus(target,YES);CUSleep(session,16);}
    // Web-backed text fields can ignore background mouse focus even though
    // AX exposes the exact field. Establish its responder before the real
    // pointer event; the pointer still determines caret position/multi-click.
    if(textInput)AXUIElementSetAttributeValue((__bridge AXUIElementRef)inputElement,kAXFocusedAttribute,kCFBooleanTrue);
    target.clickGroup=(int64_t)(NSProcessInfo.processInfo.systemUptime*1000000);
    if(target.webAccessibility&&!drag&&button==kCGMouseButtonLeft){CUMouse(session,target,kCGEventMouseMoved,from,0,button);CUSleep(session,15);CUWebPrime(session,target);}
    for(NSUInteger click=1;click<=count;click++){
      [session check];CUMouse(session,target,kCGEventMouseMoved,from,0,button);CUMouse(session,target,down,from,(int)click,button);CGPoint current=from;
      @try{
        if(drag){NSUInteger duration=MIN([args[@"duration_ms"] unsignedIntegerValue]?:400,10000),steps=MAX(2,MIN([args[@"steps"] unsignedIntegerValue]?:24,200));
          for(NSUInteger i=1;i<=steps;i++){CUSleep(session,duration/steps);[session check];current=CGPointMake(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps);CUMouse(session,target,moved,current,1,button);}
        }else CUSleep(session,4);
      }@finally{CUMouse(session,target,up,current,(int)click,button);}
      if(click<count)CUSleep(session,4);
    }
    }@finally{CUFinishKeyboardFocus(target,synthetic);}
    return CUResult(@{@"route":@"window_pointer",@"effect":@"unverifiable"});
  }
  if([name isEqualToString:@"press_key"]){
    CGKeyCode key=CUKey(args[@"key"]);CGEventFlags flags=CUFlags(args[@"modifiers"]?:@[]);
    if([args[@"key"]hasPrefix:@"f"]&&[args[@"key"]length]>1&&[args[@"key"]length]<=3)flags|=kCGEventFlagMaskSecondaryFn;
    CUWithKeyboardFocus(session,target,^{CUStroke(session,target,key,flags,nil);});
    return CUResult(@{@"route":@"window_keyboard",@"effect":@"unverifiable"});
  }
  if([name isEqualToString:@"type_text"]){
    NSString *text=args[@"text"];if(![text isKindOfClass:NSString.class])CUFail(@"INVALID_TEXT",@"Text must be a string.");
    if(!text.length)return CUResult(@{@"route":@"window_keyboard",@"effect":@"unchanged"});
    CUWithKeyboardFocus(session,target,^{
      [text enumerateSubstringsInRange:NSMakeRange(0,text.length) options:NSStringEnumerationByComposedCharacterSequences usingBlock:^(NSString *part,NSRange range,NSRange enclosing,BOOL *stop){
        [session check];CGKeyCode key=0;NSString *characters=part;CGEventFlags flags=0;
        if([part isEqual:@"\n"]||[part isEqual:@"\r"]||[part isEqual:@"\r\n"]){key=36;characters=nil;}
        else if([part isEqual:@"\t"]){key=48;characters=nil;}
        else if(part.length==1&&[part characterAtIndex:0]>=32&&[part characterAtIndex:0]<=126){
          NSString *lower=part.lowercaseString;
          NSString *shifted=@"!@#$%^&*()_+{}|:\"<>?~",*base=@"1234567890-=[]\\;',./`";NSRange symbol=[shifted rangeOfString:part];
          if(symbol.location!=NSNotFound){key=CUKey([base substringWithRange:NSMakeRange(symbol.location,1)]);flags=kCGEventFlagMaskShift;}
          else if([part isEqual:@" "])key=49;
          else if([@"abcdefghijklmnopqrstuvwxyz0123456789=-[]\\;',./`" containsString:lower]){key=CUKey(lower);if(![part isEqual:lower])flags=kCGEventFlagMaskShift;}
        }
        CUStroke(session,target,key,flags,characters);
        if([args[@"delay_ms"]unsignedIntegerValue])CUSleep(session,MIN(200,[args[@"delay_ms"]unsignedIntegerValue]));
      }];
    });
    return CUResult(@{@"route":@"window_keyboard",@"effect":@"unverifiable"});
  }
  if([name isEqualToString:@"select_text"]){
    if(!element)CUFail(@"ELEMENT_REQUIRED",@"selectText requires an observed text element.");
    NSString *value=CUAX(element,kAXValueAttribute),*needle=args[@"text"];
    if(![value isKindOfClass:NSString.class]||![needle isKindOfClass:NSString.class]||!needle.length)CUFail(@"INVALID_SELECTION",@"The element must expose text, and selected text must be nonempty.");
    NSMutableArray *ranges=[NSMutableArray new];NSRange remaining=NSMakeRange(0,value.length);
    while(remaining.length){NSRange r=[value rangeOfString:needle options:0 range:remaining];if(r.location==NSNotFound)break;NSString *prefix=args[@"prefix"],*suffix=args[@"suffix"];
      BOOL before=!prefix||[[value substringToIndex:r.location] hasSuffix:prefix],after=!suffix||[[value substringFromIndex:NSMaxRange(r)] hasPrefix:suffix];if(before&&after)[ranges addObject:[NSValue valueWithRange:r]];remaining=NSMakeRange(NSMaxRange(r),value.length-NSMaxRange(r));}
    if(ranges.count!=1)CUFail(@"AMBIGUOUS_SELECTION",@"Selection must match exactly once; use prefix/suffix to disambiguate.");
    NSRange r=[ranges[0] rangeValue];NSString *kind=args[@"selection_type"]?:@"select";if([kind isEqualToString:@"before"])r.length=0;else if([kind isEqualToString:@"after"]){r.location=NSMaxRange(r);r.length=0;}
    CFRange range=CFRangeMake(r.location,r.length);AXValueRef selection=AXValueCreate(kAXValueCFRangeType,&range);AXError error=AXUIElementSetAttributeValue(element,kAXSelectedTextRangeAttribute,selection);CFRelease(selection);
    if(error!=kAXErrorSuccess)CUFail(@"SELECTION_FAILED",@"The element refused text selection.");return CUResult(@{@"effect":@"unverifiable"});
  }
  CUFail(@"UNSUPPORTED_OPERATION",[NSString stringWithFormat:@"Native operation is not implemented: %@",name]);return nil;
}
