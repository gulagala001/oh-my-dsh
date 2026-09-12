#import <Cocoa/Cocoa.h>

static BOOL revertAXValue=NO;
@interface ControlledEditor : NSTextView
@end
@implementation ControlledEditor
- (void)setAccessibilityValue:(id)value{
  [super setAccessibilityValue:value];
  if(revertAXValue)dispatch_after(dispatch_time(DISPATCH_TIME_NOW,180*NSEC_PER_MSEC),dispatch_get_main_queue(),^{self.string=@"";});
}
@end

static BOOL hideAXFocus=NO, wrongAXWindow=NO, acceptsWebAX=NO, webAXEnabled=NO;
@interface KeyboardApplication : NSApplication
@end
@implementation KeyboardApplication
- (NSArray *)accessibilityAttributeNames{NSArray *names=[super accessibilityAttributeNames];return acceptsWebAX?[names arrayByAddingObject:@"AXManualAccessibility"]:names;}
- (BOOL)accessibilityIsAttributeSettable:(NSString *)attribute{if(acceptsWebAX&&[attribute isEqual:@"AXManualAccessibility"])return YES;return [super accessibilityIsAttributeSettable:attribute];}
- (id)accessibilityAttributeValue:(NSString *)attribute{if(acceptsWebAX&&[attribute isEqual:@"AXManualAccessibility"])return @(webAXEnabled);return [super accessibilityAttributeValue:attribute];}
- (void)accessibilitySetValue:(id)value forAttribute:(NSString *)attribute{if(acceptsWebAX&&[attribute isEqual:@"AXManualAccessibility"]){webAXEnabled=[value boolValue];return;}[super accessibilitySetValue:value forAttribute:attribute];}
- (id)accessibilityApplicationFocusedUIElement{return hideAXFocus?nil:[super accessibilityApplicationFocusedUIElement];}
- (id)accessibilityFocusedWindow{return wrongAXWindow?nil:[super accessibilityFocusedWindow];}
@end
@class KeyboardFixture;
@interface EventPad : NSView
@property (weak) KeyboardFixture *owner;
@end
@interface KeyboardFixture : NSObject <NSApplicationDelegate,NSTextViewDelegate>
@property NSWindow *window;
@property NSTextView *editor;
@property NSTextField *field;
@property EventPad *pad;
@property NSString *reportPath;
@property NSString *commandPath;
@property NSString *commandId;
@property NSMutableArray *events;
@property NSString *action;
@property NSTimer *timer;
@property id monitor;
- (void)record:(NSString *)kind event:(NSEvent *)event;
@end
@implementation EventPad
- (BOOL)acceptsFirstResponder{return YES;}
- (BOOL)acceptsFirstMouse:(NSEvent *)event{return YES;}
- (void)drawRect:(NSRect)rect{[[NSColor colorWithRed:.18 green:.42 blue:.86 alpha:1]setFill];NSRectFill(self.bounds);[@"原始键盘与多击事件区" drawAtPoint:NSMakePoint(18,32) withAttributes:@{NSForegroundColorAttributeName:NSColor.whiteColor,NSFontAttributeName:[NSFont systemFontOfSize:19]}];}
- (void)mouseDown:(NSEvent *)event{[self.window makeFirstResponder:self];[self.owner record:@"mouse-down" event:event];}
- (void)mouseUp:(NSEvent *)event{[self.owner record:@"mouse-up" event:event];}
- (void)rightMouseDown:(NSEvent *)event{[self.owner record:@"right-down" event:event];}
- (void)rightMouseUp:(NSEvent *)event{[self.owner record:@"right-up" event:event];}
- (void)otherMouseDown:(NSEvent *)event{[self.owner record:@"other-down" event:event];}
- (void)otherMouseUp:(NSEvent *)event{[self.owner record:@"other-up" event:event];}
- (void)keyDown:(NSEvent *)event{[self.owner record:@"key-down" event:event];}
- (void)keyUp:(NSEvent *)event{[self.owner record:@"key-up" event:event];}
- (void)flagsChanged:(NSEvent *)event{[self.owner record:@"flags" event:event];}
@end
@implementation KeyboardFixture
- (void)applicationDidFinishLaunching:(NSNotification *)notification{
  self.events=[NSMutableArray new];NSArray *args=NSProcessInfo.processInfo.arguments;
  for(NSUInteger i=1;i+1<args.count;i++){if([args[i]isEqual:@"--report"])self.reportPath=args[i+1];if([args[i]isEqual:@"--command"])self.commandPath=args[i+1];}
  NSMenu *menu=[NSMenu new];NSMenuItem *application=[NSMenuItem new];[menu addItem:application];application.submenu=[NSMenu new];[application.submenu addItemWithTitle:@"Quit Fixture" action:@selector(terminate:) keyEquivalent:@"q"];
  NSMenuItem *file=[NSMenuItem new];file.title=@"File";file.submenu=[NSMenu new];[menu addItem:file];
  NSMenuItem *save=[file.submenu addItemWithTitle:@"Record Shortcut" action:@selector(saved:) keyEquivalent:@"s"];save.target=self;
  NSMenuItem *edit=[NSMenuItem new];edit.title=@"Edit";edit.submenu=[NSMenu new];[menu addItem:edit];
  for(NSArray *item in @[@[@"Undo",@"undo:",@"z"],@[@"Select All",@"selectAll:",@"a"],@[@"Paste",@"paste:",@"v"]])[edit.submenu addItemWithTitle:item[0] action:NSSelectorFromString(item[1]) keyEquivalent:item[2]];
  NSApp.mainMenu=menu;
  self.window=[[NSWindow alloc]initWithContentRect:NSMakeRect(150,150,700,500) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];self.window.releasedWhenClosed=NO;self.window.title=@"Oh My DSH Keyboard Fixture";
  NSView *content=self.window.contentView;NSTextField *title=[NSTextField labelWithString:@"键盘、文字与多击验收"];title.font=[NSFont boldSystemFontOfSize:23];title.frame=NSMakeRect(25,442,650,35);[content addSubview:title];
  NSScrollView *scroll=[[NSScrollView alloc]initWithFrame:NSMakeRect(25,200,650,225)];scroll.hasVerticalScroller=YES;scroll.borderType=NSBezelBorder;[content addSubview:scroll];
  self.editor=[[ControlledEditor alloc]initWithFrame:NSMakeRect(0,0,630,225)];self.editor.richText=NO;self.editor.font=[NSFont systemFontOfSize:20];self.editor.string=@"alpha beta gamma\n第二行中文 🌿\nthird line";self.editor.accessibilityLabel=@"编辑区";self.editor.delegate=self;scroll.documentView=self.editor;
  self.field=[[NSTextField alloc]initWithFrame:NSMakeRect(25,144,650,32)];self.field.accessibilityLabel=@"单行输入";self.field.stringValue=@"single line";[content addSubview:self.field];
  self.pad=[[EventPad alloc]initWithFrame:NSMakeRect(25,28,650,85)];self.pad.owner=self;self.pad.accessibilityElement=YES;self.pad.accessibilityRole=NSAccessibilityGroupRole;self.pad.accessibilityLabel=@"事件区";[content addSubview:self.pad];
  self.editor.nextKeyView=self.field;self.field.nextKeyView=self.editor;
  [self.window orderFront:nil];
  __weak KeyboardFixture *weak=self;
  self.monitor=[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown|NSEventMaskKeyUp|NSEventMaskFlagsChanged handler:^NSEvent *(NSEvent *event){KeyboardFixture *self=weak;if(self.window.firstResponder!=self.pad)[self record:event.type==NSEventTypeKeyDown?@"key-down":event.type==NSEventTypeKeyUp?@"key-up":@"flags" event:event];return event;}];
  self.timer=[NSTimer scheduledTimerWithTimeInterval:.02 repeats:YES block:^(NSTimer *timer){
    KeyboardFixture *self=weak;NSData *data=self.commandPath?[NSData dataWithContentsOfFile:self.commandPath]:nil;NSDictionary *command=data?[NSJSONSerialization JSONObjectWithData:data options:0 error:nil]:nil;
    if(command&&![command[@"id"]isEqual:self.commandId]){self.commandId=command[@"id"];NSString *action=command[@"action"];
      if([action isEqual:@"reset"]){self.editor.string=command[@"text"]?:@"alpha beta gamma\n第二行中文 🌿\nthird line";[self.editor setSelectedRange:NSMakeRange(0,0)];self.action=@"";[self.events removeAllObjects];}
      if([action isEqual:@"revert-ax"]){revertAXValue=[command[@"enabled"]boolValue];[self record:@"command" event:nil];}
      if([action isEqual:@"ax-focus"]){hideAXFocus=[command[@"hidden"]boolValue];wrongAXWindow=[command[@"missingWindow"]boolValue];[self record:@"command" event:nil];}
      if([action isEqual:@"focus-editor"])[self.window makeFirstResponder:self.editor];
      if([action isEqual:@"focus-pad"])[self.window makeFirstResponder:self.pad];
      if([action isEqual:@"sample"]||[action isEqual:@"reset"]||[action hasPrefix:@"focus-"])[self record:@"command" event:nil];
    }
  }];
  [self record:@"ready" event:nil];
}
- (void)saved:(id)sender{self.action=@"saved";[self record:@"saved" event:nil];}
- (void)textDidChange:(NSNotification *)notification{[self record:@"text-change" event:nil];}
- (void)textViewDidChangeSelection:(NSNotification *)notification{if(self.events)[self record:@"selection" event:nil];}
- (void)record:(NSString *)kind event:(NSEvent *)event{
  NSMutableDictionary *record=[@{@"kind":kind,@"at":@(NSProcessInfo.processInfo.systemUptime)}mutableCopy];
  if(event){record[@"flags"]=@(event.modifierFlags);if(event.type==NSEventTypeKeyDown||event.type==NSEventTypeKeyUp||event.type==NSEventTypeFlagsChanged){record[@"keyCode"]=@(event.keyCode);if(event.type!=NSEventTypeFlagsChanged){record[@"characters"]=event.characters?:@"";record[@"ignoringModifiers"]=event.charactersIgnoringModifiers?:@"";}}
    else{record[@"clickCount"]=@(event.clickCount);record[@"button"]=@(event.buttonNumber);}
  }
  [self.events addObject:record];if(self.events.count>1000)[self.events removeObjectAtIndex:0];
  NSRange selection=self.editor.selectedRange;CGEventRef sample=CGEventCreate(NULL);CGPoint mouse=CGEventGetLocation(sample);CFRelease(sample);
  NSDictionary *state=@{@"webAXEnabled":@(webAXEnabled),@"pid":@(getpid()),@"frontmostPid":@(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier),@"active":@(NSApp.active),@"keyWindow":@(self.window.keyWindow),@"focus":self.window.firstResponder==self.pad?@"pad":self.window.firstResponder==self.editor?@"editor":@"other",@"text":self.editor.string?:@"",@"selection":@[@(selection.location),@(selection.length)],@"field":self.field.stringValue?:@"",@"action":self.action?:@"",@"events":self.events,@"commandId":self.commandId?:@"",@"mouse":@[@(mouse.x),@(mouse.y)]};
  if(self.reportPath)[[NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:nil]writeToFile:self.reportPath atomically:YES];
}
@end
int main(int argc,const char *argv[]){@autoreleasepool{acceptsWebAX=[NSProcessInfo.processInfo.arguments containsObject:@"--web-ax"];NSApplication *app=KeyboardApplication.sharedApplication;[app setActivationPolicy:NSApplicationActivationPolicyRegular];KeyboardFixture *delegate=[KeyboardFixture new];app.delegate=delegate;[app run];}return 0;}
