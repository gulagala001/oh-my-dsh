#import "ComputerUse.h"
#import <sys/file.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <unistd.h>

@interface CUPasteProvider : NSObject <NSPasteboardItemDataProvider>
@property NSDictionary<NSString *,NSData *> *representations;
@property BOOL requested;
@property CFAbsoluteTime lastRequest;
@end
@implementation CUPasteProvider
- (void)pasteboard:(NSPasteboard *)pasteboard item:(NSPasteboardItem *)item provideDataForType:(NSPasteboardType)type {
  NSData *data=self.representations[type];if(data){[item setData:data forType:type];@synchronized(self){self.requested=YES;self.lastRequest=CFAbsoluteTimeGetCurrent();}}
}
@end

static void CUPasteMain(void (^block)(void)) {
  if(NSThread.isMainThread){block();return;}
  dispatch_semaphore_t done=dispatch_semaphore_create(0);__block NSException *failure;
  CFRunLoopPerformBlock(CFRunLoopGetMain(),kCFRunLoopCommonModes,^{@try{block();}@catch(NSException *error){failure=error;}@finally{dispatch_semaphore_signal(done);}});
  CFRunLoopWakeUp(CFRunLoopGetMain());dispatch_semaphore_wait(done,DISPATCH_TIME_FOREVER);if(failure)@throw failure;
}
static NSArray<NSPasteboardItem *> *CUSaveClipboard(NSPasteboard *pasteboard) {
  NSMutableArray *saved=[NSMutableArray new];
  for(NSPasteboardItem *original in pasteboard.pasteboardItems){
    NSPasteboardItem *copy=[NSPasteboardItem new];
    for(NSString *type in original.types){NSData *data=[original dataForType:type];if(!data||![copy setData:data forType:type])CUFail(@"CLIPBOARD_UNAVAILABLE",@"The current clipboard could not be preserved. Paste was not started.");}
    [saved addObject:copy];
  }return saved;
}
static int CUPasteLock(CUSession *session) {
  // General pasteboard is shared even across independently started hosts.
  NSString *path=[NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"trisoul-cu-paste-%u.lock",getuid()]];
  int fd=open(path.fileSystemRepresentation,O_CREAT|O_RDWR|O_NOFOLLOW,0600);struct stat info;
  if(fd<0)CUFail(@"CLIPBOARD_BUSY",@"Could not coordinate access to the clipboard.");
  if(fstat(fd,&info)||!S_ISREG(info.st_mode)||info.st_uid!=getuid()){close(fd);CUFail(@"CLIPBOARD_BUSY",@"Clipboard coordination is unavailable.");}
  @try{while(flock(fd,LOCK_EX|LOCK_NB)){if(errno!=EWOULDBLOCK&&errno!=EINTR)CUFail(@"CLIPBOARD_BUSY",@"Could not coordinate access to the clipboard.");[session check];usleep(8000);}[session check];}
  @catch(NSException *error){close(fd);@throw error;}return fd;
}
NSDictionary *CUPaste(CUSession *session,NSDictionary *args,AXUIElementRef focused,void (^deliver)(void)) {
  NSString *text=args[@"text"],*html=args[@"html"];
  if(![text isKindOfClass:NSString.class]||(html&&![html isKindOfClass:NSString.class]))CUFail(@"INVALID_PASTE",@"Paste requires text and an optional HTML string.");
  if(!text.length&&!html.length)return CUResult(@{@"effect":@"unchanged"});
  int lock=CUPasteLock(session);__block NSArray *saved;__block NSInteger ownership=-1;__block NSPasteboard *pasteboard;__block BOOL published=NO,populated=NO;
  NSString *markerType=@"ai.trisoul.computer-use.paste";NSData *marker=[NSUUID.UUID.UUIDString dataUsingEncoding:NSUTF8StringEncoding];
  BOOL (^ownsClipboard)(void)=^BOOL{return pasteboard.changeCount==ownership&&(!populated||[[pasteboard dataForType:markerType]isEqual:marker])&&pasteboard.changeCount==ownership;};
  CUPasteProvider *provider=[CUPasteProvider new];NSMutableDictionary *data=[@{NSPasteboardTypeString:[text dataUsingEncoding:NSUTF8StringEncoding]}mutableCopy];
  if(html)data[NSPasteboardTypeHTML]=[[NSString stringWithFormat:@"<meta charset=\"utf-8\">%@",html]dataUsingEncoding:NSUTF8StringEncoding];provider.representations=data;
  NSString *before=CUAX(focused,kAXValueAttribute);BOOL canObserve=[before isKindOfClass:NSString.class];id beforeSelection=CUAX(focused,kAXSelectedTextRangeAttribute);
  __block BOOL restored=NO;BOOL consumed=NO;BOOL changedByUser=NO;
  @try{
    [session check];
    CUPasteMain(^{
      pasteboard=NSPasteboard.generalPasteboard;NSInteger version=pasteboard.changeCount;saved=CUSaveClipboard(pasteboard);
      [session check];if(pasteboard.changeCount!=version)CUFail(@"CLIPBOARD_CHANGED",@"The clipboard changed while preparing paste. Try again.");
      NSPasteboardItem *item=[NSPasteboardItem new];[item setDataProvider:provider forTypes:data.allKeys];
      [item setData:marker forType:markerType];
      ownership=[pasteboard clearContents];published=YES;
      if(pasteboard.changeCount!=ownership)CUFail(@"CLIPBOARD_CHANGED",@"The clipboard changed while preparing paste. Try again.");
      if(![pasteboard writeObjects:@[item]])CUFail(@"CLIPBOARD_UNAVAILABLE",@"Could not prepare the paste clipboard.");ownership=pasteboard.changeCount;populated=YES;
    });
    [session check];deliver();
    // AX menu delivery may return before an app reads its pasteboard. Wait for
    // consumption, not a fixed sleep. Cancellation prevents queued actions but
    // cannot retract Paste already dispatched to another process.
    CFAbsoluteTime deadline=CFAbsoluteTimeGetCurrent()+3;
    do {
      if(!ownsClipboard()){changedByUser=YES;break;}
      BOOL requested;CFAbsoluteTime last;@synchronized(provider){requested=provider.requested;last=provider.lastRequest;}
      if(requested){
        NSString *after=canObserve?CUAX(focused,kAXValueAttribute):nil;
        // A clipboard observer may request bytes before the target. An actual
        // text change is stronger evidence when the target exposes its value.
        id afterSelection=beforeSelection?CUAX(focused,kAXSelectedTextRangeAttribute):nil;
        BOOL selectionChanged=beforeSelection&&afterSelection&&!CFEqual((__bridge CFTypeRef)beforeSelection,(__bridge CFTypeRef)afterSelection);
        if((canObserve&&[after isKindOfClass:NSString.class]&&![after isEqual:before])||selectionChanged||(!canObserve&&CFAbsoluteTimeGetCurrent()-last>.08)){consumed=YES;break;}
      }
      usleep(8000);
    }while(CFAbsoluteTimeGetCurrent()<deadline);
    if(changedByUser)CUFail(@"CLIPBOARD_CHANGED",@"The clipboard changed during paste. The newer clipboard was kept; check the target before retrying.");
    if(!consumed)CUFail(@"PASTE_UNCONFIRMED",@"The app has not confirmed reading the paste. Check the target before retrying; an already dispatched Paste cannot be retracted.");
    [session check];
  }@finally{
    @try{if(published)CUPasteMain(^{if(ownsClipboard()){[pasteboard clearContents];if(saved.count&&![pasteboard writeObjects:saved])CUFail(@"CLIPBOARD_RESTORE_FAILED",@"Paste completed, but the prior clipboard could not be restored.");restored=YES;}});}
    @finally{flock(lock,LOCK_UN);close(lock);}
  }
  return CUResult(@{@"route":@"clipboard",@"effect":@"unverifiable",@"clipboard_restored":@(restored)});
}
