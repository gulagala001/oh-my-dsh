#import <Cocoa/Cocoa.h>

@interface SurfaceFixture : NSObject <NSApplicationDelegate>
@property NSWindow *window;
@property NSScrollView *outer;
@property NSScrollView *inner;
@property NSString *report;
@property NSString *command;
@property NSString *lastCommand;
@property NSMutableArray *events;
@property NSMutableArray *wheels;
@property id wheelMonitor;
@property NSTimer *timer;
- (void)record:(NSString *)event;
@end

@interface Surface : NSView
@property (weak) SurfaceFixture *owner;
@property BOOL grid;
@end
@implementation Surface
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (void)drawRect:(NSRect)dirty {
  [NSColor.whiteColor setFill];NSRectFill(dirty);
  if(self.grid)for(int y=0;y<self.bounds.size.height;y+=50)for(int x=0;x<self.bounds.size.width;x+=100){
    [[NSColor colorWithWhite:.88 alpha:1]setStroke];[NSBezierPath strokeRect:NSMakeRect(x,y,100,50)];
    [[NSString stringWithFormat:@"%d,%d",x,y]drawAtPoint:NSMakePoint(x+8,y+8) withAttributes:@{NSForegroundColorAttributeName:NSColor.blackColor}];
  }
}
- (void)mouseDown:(NSEvent *)event { [self.owner record:@"mouse-down"]; }
- (void)mouseUp:(NSEvent *)event { [self.owner record:@"mouse-up"]; }
@end

@implementation SurfaceFixture
- (NSScrollView *)scroll:(NSRect)frame size:(NSSize)size label:(NSString *)label {
  NSScrollView *scroll=[[NSScrollView alloc]initWithFrame:frame];scroll.hasVerticalScroller=YES;scroll.hasHorizontalScroller=YES;
  scroll.scrollerStyle=NSScrollerStyleLegacy;scroll.borderType=NSBezelBorder;scroll.accessibilityLabel=label;
  Surface *content=[[Surface alloc]initWithFrame:NSMakeRect(0,0,size.width,size.height)];content.grid=YES;content.owner=self;scroll.documentView=content;
  scroll.contentView.postsBoundsChangedNotifications=YES;
  [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(scrolled:) name:NSViewBoundsDidChangeNotification object:scroll.contentView];
  return scroll;
}
- (void)applicationDidFinishLaunching:(NSNotification *)note {
  self.events=[NSMutableArray new];self.wheels=[NSMutableArray new];NSArray *args=NSProcessInfo.processInfo.arguments;
  for(NSUInteger i=1;i+1<args.count;i++){if([args[i]isEqual:@"--report"])self.report=args[i+1];if([args[i]isEqual:@"--command"])self.command=args[i+1];}
  self.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(200,170,660,430) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
  self.window.title=@"Trisoul Native Surface Fixture";
  Surface *root=[[Surface alloc]initWithFrame:NSMakeRect(0,0,660,430)];root.owner=self;self.window.contentView=root;
  NSTextField *heading=[NSTextField labelWithString:@"Native cursor and nested scrolling"];heading.frame=NSMakeRect(28,20,600,30);[root addSubview:heading];
  self.outer=[self scroll:NSMakeRect(28,110,600,290) size:NSMakeSize(1800,1400) label:@"Outer viewport"];[root addSubview:self.outer];
  self.inner=[self scroll:NSMakeRect(80,60,300,160) size:NSMakeSize(1200,900) label:@"Inner viewport"];[self.outer.documentView addSubview:self.inner];
  [self.window orderFront:nil];
  __weak SurfaceFixture *weak=self;
  self.wheelMonitor=[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel handler:^NSEvent *(NSEvent *event){
    [weak.wheels addObject:@{@"dx":@(event.scrollingDeltaX),@"dy":@(event.scrollingDeltaY),@"phase":@(event.phase),@"momentum":@(event.momentumPhase),@"precise":@(event.hasPreciseScrollingDeltas),@"at":@(NSProcessInfo.processInfo.systemUptime)}];
    [weak record:@"wheel"];return event;
  }];
  self.timer=[NSTimer scheduledTimerWithTimeInterval:.02 repeats:YES block:^(NSTimer *timer){
    SurfaceFixture *self=weak;if(!self)return;
    NSDictionary *command=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:self.command]?:[NSData data] options:0 error:nil];
    NSString *identifier=command[@"id"];
    if(identifier&&![identifier isEqual:self.lastCommand]){
      self.lastCommand=identifier;
      if([command[@"action"]isEqual:@"front"]){[self.window makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];}
      if([command[@"action"]isEqual:@"reset-scroll"]){[self.outer.contentView scrollToPoint:NSZeroPoint];[self.inner.contentView scrollToPoint:NSZeroPoint];[self.outer reflectScrolledClipView:self.outer.contentView];[self.inner reflectScrolledClipView:self.inner.contentView];}
      [self record:@"command"];
    }
  }];
  [self record:@"ready"];
}
- (void)record:(NSString *)event {
  if(!self.report)return;
  NSPoint mouse=NSEvent.mouseLocation,outer=self.outer.contentView.bounds.origin,inner=self.inner.contentView.bounds.origin;
  [self.events addObject:@{@"event":event,@"at":@(NSProcessInfo.processInfo.systemUptime),@"outer":@[@(outer.x),@(outer.y)],@"inner":@[@(inner.x),@(inner.y)]}];
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,kCGNullWindowID));
  NSArray *order=[windows valueForKey:(__bridge NSString *)kCGWindowNumber];
  NSDictionary *state=@{@"pid":@(getpid()),@"windowId":@(self.window.windowNumber),@"frontmostPid":@(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier),@"keyWindow":@(self.window.keyWindow),@"mouse":@[@(mouse.x),@(mouse.y)],@"command":self.lastCommand?:@"",@"outer":@[@(outer.x),@(outer.y)],@"inner":@[@(inner.x),@(inner.y)],@"events":self.events,@"wheels":self.wheels,@"order":order?:@[]};
  [[NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:nil]writeToFile:self.report atomically:YES];
}
- (void)scrolled:(NSNotification *)note { [self record:@"scroll"]; }
- (void)applicationDidBecomeActive:(NSNotification *)note { if(self.events)[self record:@"became-active"]; }
- (void)applicationDidResignActive:(NSNotification *)note { if(self.events)[self record:@"resigned-active"]; }
@end
int main(void) { @autoreleasepool { NSApplication *app=NSApplication.sharedApplication;[app setActivationPolicy:NSApplicationActivationPolicyRegular];SurfaceFixture *delegate=[SurfaceFixture new];app.delegate=delegate;[app run];}return 0; }
