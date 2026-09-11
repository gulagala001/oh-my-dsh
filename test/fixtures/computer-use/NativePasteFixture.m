#import <Cocoa/Cocoa.h>

// The user's clipboard is held only in this process's memory. Reports contain
// known fixture text and equality flags, never the saved clipboard contents.
static NSArray *Snapshot(NSPasteboard *pb) {
  NSMutableArray *items=[NSMutableArray new];
  for(NSPasteboardItem *item in pb.pasteboardItems){NSMutableDictionary *data=[NSMutableDictionary new];for(NSString *type in item.types){NSData *value=[item dataForType:type];if(value)data[type]=value;}[items addObject:data];}
  return items;
}
static void WriteItems(NSPasteboard *pb,NSArray *snapshot) {
  NSMutableArray *items=[NSMutableArray new];for(NSDictionary *data in snapshot){NSPasteboardItem *item=[NSPasteboardItem new];for(NSString *type in data)[item setData:data[type] forType:type];[items addObject:item];}
  [pb clearContents];if(items.count)[pb writeObjects:items];
}
@class PasteFixture;
@interface PasteView : NSTextView
@property (weak) PasteFixture *owner;
@end
@interface PasteFixture : NSObject <NSApplicationDelegate,NSTextViewDelegate>
@property NSWindow *window;
@property PasteView *editor;
@property NSString *reportPath;
@property NSString *commandPath;
@property NSArray *originalClipboard;
@property NSArray *seed;
@property NSMutableArray *events;
@property BOOL seeded;
@property BOOL restoring;
@property BOOL clipboardRestored;
@property BOOL copyPreserved;
@property NSInteger pasteDelay;
@property NSString *commandId;
@property NSTimer *timer;
@property id keyMonitor;
- (void)record:(NSString *)event;
- (void)restore;
@end
@implementation PasteView
- (void)paste:(id)sender {
  [self.owner record:@"paste-invoked"];
  if(self.owner.pasteDelay){dispatch_after(dispatch_time(DISPATCH_TIME_NOW,self.owner.pasteDelay*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[super paste:sender];[self.owner record:@"paste-consumed"];});}
  else {[super paste:sender];[self.owner record:@"paste-consumed"];}
}
@end
@implementation PasteFixture
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  NSArray *args=NSProcessInfo.processInfo.arguments;self.reportPath=args[[args indexOfObject:@"--report"]+1];self.commandPath=args[[args indexOfObject:@"--command"]+1];self.events=[NSMutableArray new];
  NSMenu *menu=[NSMenu new];NSMenuItem *app=[NSMenuItem new];app.submenu=[NSMenu new];[app.submenu addItemWithTitle:@"Quit" action:@selector(terminate:) keyEquivalent:@"q"];[menu addItem:app];
  NSMenuItem *edit=[NSMenuItem new];edit.title=@"Edit";edit.submenu=[NSMenu new];[menu addItem:edit];
  for(NSArray *command in @[@[@"Paste",@"paste:",@"v"],@[@"Select All",@"selectAll:",@"a"],@[@"Undo",@"undo:",@"z"]])[edit.submenu addItemWithTitle:command[0] action:NSSelectorFromString(command[1]) keyEquivalent:command[2]];
  NSApp.mainMenu=menu;
  __weak PasteFixture *weakSelf=self;self.keyMonitor=[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown|NSEventMaskKeyUp handler:^NSEvent *(NSEvent *event){[weakSelf record:@"keyboard-event"];return event;}];
  self.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(160,160,680,400) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];self.window.title=@"Trisoul Paste Fixture";
  NSTextField *heading=[NSTextField labelWithString:@"Computer Use · 富文本粘贴测试"];heading.frame=NSMakeRect(24,348,630,32);heading.font=[NSFont boldSystemFontOfSize:22];[self.window.contentView addSubview:heading];
  NSScrollView *scroll=[[NSScrollView alloc]initWithFrame:NSMakeRect(24,24,632,310)];scroll.hasVerticalScroller=YES;scroll.borderType=NSBezelBorder;
  self.editor=[[PasteView alloc]initWithFrame:scroll.contentView.bounds];self.editor.owner=self;self.editor.delegate=self;self.editor.richText=YES;self.editor.allowsUndo=YES;self.editor.accessibilityLabel=@"Paste editor";self.editor.font=[NSFont systemFontOfSize:16];self.editor.verticallyResizable=YES;self.editor.autoresizingMask=NSViewWidthSizable;scroll.documentView=self.editor;[self.window.contentView addSubview:scroll];
  [self.window makeFirstResponder:self.editor];[self.window orderFront:nil];
  self.timer=[NSTimer scheduledTimerWithTimeInterval:.01 target:self selector:@selector(poll:) userInfo:nil repeats:YES];[self record:@"ready"];
}
- (void)textDidChange:(NSNotification *)notification {[self record:@"text-changed"];}
- (void)record:(NSString *)event {
  [self.events addObject:@{@"event":event,@"at":@([NSDate timeIntervalSinceReferenceDate])}];
  BOOL known=!self.editor.string.length||[self.editor.string hasPrefix:@"CU "];
  NSMutableArray *runs=[NSMutableArray new];if(known)[self.editor.textStorage enumerateAttributesInRange:NSMakeRange(0,self.editor.string.length) options:0 usingBlock:^(NSDictionary *attributes,NSRange range,BOOL *stop){
    NSFont *font=attributes[NSFontAttributeName];NSFontTraitMask traits=font?[[NSFontManager sharedFontManager]traitsOfFont:font]:0;
    [runs addObject:@{@"text":[self.editor.string substringWithRange:range],@"bold":@((traits&NSBoldFontMask)!=0),@"italic":@((traits&NSItalicFontMask)!=0),@"size":@(font.pointSize),@"link":[attributes[NSLinkAttributeName] description]?:@""}];
  }];
  NSDictionary *report=@{@"pid":@(getpid()),@"windowId":@(self.window.windowNumber),@"text":known?self.editor.string:@"[unexpected clipboard text withheld]",@"runs":runs,@"events":self.events,@"commandId":self.commandId?:@"",@"active":@(NSApp.active),@"frontmost":@((BOOL)(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==getpid())),@"keyWindow":@(self.window.keyWindow),@"mainWindow":@(self.window.mainWindow),@"hasPasteTarget":@([NSApp targetForAction:@selector(paste:)]==self.editor),@"clipboardRestored":@(self.clipboardRestored),@"copyPreserved":@(self.copyPreserved)};
  [[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil]writeToFile:self.reportPath atomically:YES];
}
- (void)restore {
  if(!self.seeded)return;
  NSPasteboard *pb=NSPasteboard.generalPasteboard;NSInteger count=pb.changeCount;NSArray *current=Snapshot(pb);
  // Only restore known test data. A user copy during this test wins.
  BOOL ours=[current isEqual:self.seed];
  if(!ours&&current.count==1){NSData *data=current[0][NSPasteboardTypeString];NSString *text=[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding];ours=[text hasPrefix:@"CU "];}
  if(ours&&pb.changeCount==count)WriteItems(pb,self.originalClipboard);
  self.originalClipboard=nil;self.seeded=NO;
}
- (void)poll:(NSTimer *)timer {
  NSData *data=[NSData dataWithContentsOfFile:self.commandPath];if(!data)return;NSDictionary *command=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if(!command||[command[@"id"]isEqual:self.commandId])return;self.commandId=command[@"id"];
  NSString *action=command[@"action"];
  if([action isEqual:@"seed"]&&!self.seeded){
    NSPasteboard *pb=NSPasteboard.generalPasteboard;NSInteger count=pb.changeCount;self.originalClipboard=Snapshot(pb);
    if(count!=pb.changeCount){[self record:@"seed-raced"];return;}
    self.seed=@[@{NSPasteboardTypeString:[@"CU original clipboard" dataUsingEncoding:NSUTF8StringEncoding],@"ai.trisoul.test.binary":[NSData dataWithBytes:"\0\xff\x12" length:3]},@{NSPasteboardTypeString:[@"CU second item" dataUsingEncoding:NSUTF8StringEncoding]}];WriteItems(pb,self.seed);self.seeded=YES;
  }else if([action isEqual:@"reset"]){[self.editor.textStorage setAttributedString:[[NSAttributedString alloc]initWithString:@""]];self.editor.richText=![command[@"plain"]boolValue];self.editor.editable=![command[@"readonly"]boolValue];self.pasteDelay=[command[@"delay"]integerValue];[self.window makeFirstResponder:self.editor];}
  else if([action isEqual:@"sample"]){self.clipboardRestored=self.seeded&&[Snapshot(NSPasteboard.generalPasteboard)isEqual:self.seed];self.copyPreserved=[[NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString]isEqual:@"CU concurrent copy"];}
  else if([action isEqual:@"copy"]){[NSPasteboard.generalPasteboard clearContents];[NSPasteboard.generalPasteboard setString:@"CU concurrent copy" forType:NSPasteboardTypeString];}
  else if([action isEqual:@"quit"]){[self restore];[self record:@"quit"];[NSApp terminate:nil];return;}
  [self record:action];
}
- (void)applicationWillTerminate:(NSNotification *)notification {[self restore];}
- (void)applicationDidBecomeActive:(NSNotification *)notification {if(self.events)[self record:@"became-active"];}
@end
int main(void){@autoreleasepool{NSApplication *app=NSApplication.sharedApplication;[app setActivationPolicy:NSApplicationActivationPolicyRegular];PasteFixture *fixture=[PasteFixture new];app.delegate=fixture;[app run];}return 0;}
