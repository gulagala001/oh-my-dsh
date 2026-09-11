#import <Cocoa/Cocoa.h>

@interface Fixture : NSObject <NSApplicationDelegate>
@property NSWindow *window;
@property NSTextField *name;
@property NSTextField *result;
@property NSMutableArray *events;
@property NSString *reportPath;
@property BOOL mouseHeld;
@property NSUInteger dragCount;
@property id keyMonitor;
@property NSTextField *originalName;
@property NSButton *inserted;
@property NSString *commandPath;
@property NSString *commandId;
@property NSTimer *commandTimer;
- (void)record:(NSString *)event;
@end
@interface DragPad : NSView
@property (weak) Fixture *owner;
@end
@implementation DragPad
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }
- (BOOL)acceptsFirstResponder { return YES; }
- (void)drawRect:(NSRect)dirtyRect { [[NSColor colorWithRed:.20 green:.45 blue:.90 alpha:1] setFill];NSRectFill(self.bounds);[@"拖拽测试区" drawAtPoint:NSMakePoint(16,16) withAttributes:@{NSForegroundColorAttributeName:NSColor.whiteColor}]; }
- (void)mouseDown:(NSEvent *)event { self.owner.mouseHeld=YES;[self.owner record:@"mouse-down"]; }
- (void)mouseDragged:(NSEvent *)event { self.owner.dragCount++;[self.owner record:@"mouse-dragged"]; }
- (void)mouseUp:(NSEvent *)event { self.owner.mouseHeld=NO;[self.owner record:@"mouse-up"]; }
@end
@implementation Fixture
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  self.events=[NSMutableArray new];
  NSMenu *menu=[NSMenu new];
  NSMenuItem *application=[NSMenuItem new];[menu addItem:application];
  application.submenu=[NSMenu new];[application.submenu addItemWithTitle:@"Quit Fixture" action:@selector(terminate:) keyEquivalent:@"q"];
  NSMenuItem *edit=[NSMenuItem new];edit.title=@"Edit";edit.submenu=[[NSMenu alloc]initWithTitle:@"Edit"];[menu addItem:edit];
  for(NSArray *item in @[@[@"Undo",@"undo:",@"z"],@[@"Cut",@"cut:",@"x"],@[@"Copy",@"copy:",@"c"],@[@"Paste",@"paste:",@"v"],@[@"Select All",@"selectAll:",@"a"]]){
    [edit.submenu addItemWithTitle:item[0] action:NSSelectorFromString(item[1]) keyEquivalent:item[2]];
  }
  NSApp.mainMenu=menu;
  __weak Fixture *weakSelf=self;
  self.keyMonitor=[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown|NSEventMaskKeyUp handler:^NSEvent *(NSEvent *event){
    [weakSelf record:[NSString stringWithFormat:@"key-%@:%hu",event.type==NSEventTypeKeyDown?@"down":@"up",event.keyCode]];return event;
  }];
  NSArray *args=NSProcessInfo.processInfo.arguments;
  NSUInteger index=[args indexOfObject:@"--report"];
  if(index!=NSNotFound && index+1<args.count) self.reportPath=args[index+1];
  index=[args indexOfObject:@"--command"];if(index!=NSNotFound&&index+1<args.count)self.commandPath=args[index+1];
  self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(150,150,660,430) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
  self.window.releasedWhenClosed=NO;
  self.window.title = @"Trisoul Computer Use Fixture";
  NSView *view = self.window.contentView;
  NSTextField *heading = [NSTextField labelWithString:@"Computer Use 原生测试工作台"];
  heading.frame = NSMakeRect(28,365,600,30); heading.font = [NSFont boldSystemFontOfSize:21]; [view addSubview:heading];
  self.name = [[NSTextField alloc] initWithFrame:NSMakeRect(28,290,590,34)];
  self.name.placeholderString = @"输入中文和多行测试文本"; self.name.accessibilityLabel = @"姓名"; [view addSubview:self.name];
  self.name.accessibilityIdentifier=@"shared-field-identifier";
  if([args containsObject:@"--references"]){
    NSArray *commands=@[@"Insert control",@"Replace field",@"Restore field"];
    for(NSUInteger i=0;i<commands.count;i++){NSButton *button=[NSButton buttonWithTitle:commands[i] target:self action:@selector(changeReferences:)];button.frame=NSMakeRect(28+i*195,332,185,26);[view addSubview:button];}
  }
  NSArray *titles = @[@"Save As",@"Save",@"Delayed"];
  for (NSUInteger i=0;i<titles.count;i++) { NSButton *button=[NSButton buttonWithTitle:titles[i] target:self action:@selector(pressed:)]; button.frame=NSMakeRect(28+i*160,230,140,34); [view addSubview:button]; }
  NSButton *check = [NSButton checkboxWithTitle:@"启用通知" target:self action:@selector(pressed:)]; check.frame=NSMakeRect(28,185,200,30);[view addSubview:check];
  self.result = [NSTextField labelWithString:@"尚未操作"];self.result.frame=NSMakeRect(28,115,590,65);self.result.accessibilityLabel=@"操作结果";[view addSubview:self.result];
  DragPad *pad=[[DragPad alloc] initWithFrame:NSMakeRect(28,30,590,60)];pad.owner=self;pad.accessibilityElement=YES;pad.accessibilityRole=NSAccessibilityGroupRole;pad.accessibilityLabel=@"拖拽测试区";[view addSubview:pad];
  [self.window orderFront:nil];
  if(self.commandPath){
    __weak Fixture *weak=self;
    self.commandTimer=[NSTimer scheduledTimerWithTimeInterval:.02 repeats:YES block:^(NSTimer *timer){
      Fixture *self=weak;NSData *data=[NSData dataWithContentsOfFile:self.commandPath];if(!data)return;
      NSDictionary *command=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if(!command||[command[@"id"]isEqual:self.commandId])return;self.commandId=command[@"id"];
      if([command[@"action"]isEqual:@"text"]){self.name.stringValue=command[@"value"]?:@"";}
      if([command[@"action"]isEqual:@"resize"]){[self.window setContentSize:NSMakeSize([command[@"width"]doubleValue],[command[@"height"]doubleValue])];}
      if([command[@"action"]isEqual:@"move"]){[self.window setFrameOrigin:NSMakePoint([command[@"x"]doubleValue],[command[@"y"]doubleValue])];}
      [self record:@"fixture-command"];
      if([command[@"action"]isEqual:@"close"])[self.window close];
    }];
  }
  [self record:@"ready"];
}
- (void)record:(NSString *)event {
  [self.events addObject:@{@"event":event,@"at":@([NSDate timeIntervalSinceReferenceDate]),@"active":@(NSApp.active)}];
  if(self.reportPath) {
    NSDictionary *state=@{@"name":self.name.stringValue?:@"",@"result":self.result.stringValue?:@"",@"mouseHeld":@(self.mouseHeld),@"dragCount":@(self.dragCount),@"events":self.events,@"pid":@(NSProcessInfo.processInfo.processIdentifier),@"frontmostPid":@(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier),@"keyWindow":@(self.window.keyWindow),@"commandId":self.commandId?:@""};
    NSData *data=[NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:nil];
    [data writeToFile:self.reportPath atomically:YES];
  }
}
- (void)applicationDidBecomeActive:(NSNotification *)notification { if(self.events) [self record:@"became-active"]; }
- (void)applicationDidResignActive:(NSNotification *)notification { if(self.events) [self record:@"resigned-active"]; }
- (void)pressed:(NSButton *)button {
  if ([button.title isEqualToString:@"Delayed"]) { dispatch_after(dispatch_time(DISPATCH_TIME_NOW,350*NSEC_PER_MSEC), dispatch_get_main_queue(), ^{self.result.stringValue=@"延迟完成";[self record:@"delayed-done"];}); }
  else { self.result.stringValue=[NSString stringWithFormat:@"%@ | %@",button.title,self.name.stringValue];[self record:button.title]; }
}
- (void)changeReferences:(NSButton *)button {
  if([button.title isEqual:@"Insert control"]&&!self.inserted){
    self.inserted=[NSButton buttonWithTitle:@"Inserted control" target:self action:@selector(pressed:)];self.inserted.frame=NSMakeRect(438,190,180,28);
    [self.window.contentView addSubview:self.inserted positioned:NSWindowBelow relativeTo:self.name];
  }else if([button.title isEqual:@"Replace field"]&&!self.originalName){
    self.originalName=self.name;NSTextField *replacement=[[NSTextField alloc]initWithFrame:self.name.frame];
    replacement.accessibilityLabel=self.name.accessibilityLabel;replacement.accessibilityIdentifier=self.name.accessibilityIdentifier;replacement.placeholderString=self.name.placeholderString;replacement.stringValue=@"replacement";
    [self.name removeFromSuperview];self.name=replacement;[self.window.contentView addSubview:replacement];
  }else if([button.title isEqual:@"Restore field"]&&self.originalName){
    [self.name removeFromSuperview];self.name=self.originalName;self.originalName=nil;[self.window.contentView addSubview:self.name];
  }
  [self record:button.title];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return self.commandPath==nil; }
@end
int main(int argc,const char *argv[]) { @autoreleasepool { NSApplication *app=[NSApplication sharedApplication];[app setActivationPolicy:NSApplicationActivationPolicyRegular];Fixture *delegate=[Fixture new];app.delegate=delegate;[app run];}return 0; }
