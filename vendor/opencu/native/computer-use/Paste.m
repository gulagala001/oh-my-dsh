#import "ComputerUse.h"
#import "Clipboard.h"
#import <ImageIO/ImageIO.h>
#import <sys/file.h>
#import <sys/stat.h>
#import <fcntl.h>
#import <string.h>
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
static int CUClipboardLock(CUSession *session,NSTimeInterval timeout) {
  // General pasteboard is shared even across independently started hosts.
  NSString *path=[NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"trisoul-cu-paste-%u.lock",getuid()]];
  int fd=open(path.fileSystemRepresentation,O_CREAT|O_RDWR|O_NOFOLLOW,0600);struct stat info;
  if(fd<0)CUFail(@"CLIPBOARD_BUSY",@"Could not coordinate access to the clipboard.");
  if(fstat(fd,&info)||!S_ISREG(info.st_mode)||info.st_uid!=getuid()){close(fd);CUFail(@"CLIPBOARD_BUSY",@"Clipboard coordination is unavailable.");}
  NSTimeInterval deadline=NSProcessInfo.processInfo.systemUptime+timeout;
  @try{[session check];while(flock(fd,LOCK_EX|LOCK_NB)){if(errno!=EWOULDBLOCK&&errno!=EINTR)CUFail(@"CLIPBOARD_BUSY",@"Could not coordinate access to the clipboard.");[session check];if(timeout>0&&(NSThread.isMainThread||NSProcessInfo.processInfo.systemUptime>=deadline))CUFail(@"CLIPBOARD_BUSY",@"The clipboard is still in use. Try copying again.");usleep(8000);}[session check];}
  @catch(NSException *error){close(fd);@throw error;}return fd;
}
NSDictionary *CUCopyImageToClipboard(CUSession *session,NSDictionary *args) {
  const NSUInteger maximumBytes=2*1024*1024,maximumDimension=16384,maximumPixels=32*1024*1024;
  NSString *encoded=args[@"pngBase64"];
  if(![encoded isKindOfClass:NSString.class]||!encoded.length||encoded.length%4)CUFail(@"INVALID_CLIPBOARD_IMAGE",@"Copy requires a base64 PNG string.");
  if(encoded.length>4*((maximumBytes+2)/3))CUFail(@"CLIPBOARD_IMAGE_TOO_LARGE",@"The screenshot PNG exceeds the 2 MiB clipboard limit.");
  NSData *png=[[NSData alloc]initWithBase64EncodedString:encoded options:0];
  if(!png.length)CUFail(@"INVALID_CLIPBOARD_IMAGE",@"The screenshot is not valid base64 PNG data.");
  if(png.length>maximumBytes)CUFail(@"CLIPBOARD_IMAGE_TOO_LARGE",@"The screenshot PNG exceeds the 2 MiB clipboard limit.");
  const unsigned char signature[]={137,80,78,71,13,10,26,10},end[]={0,0,0,0,73,69,78,68,174,66,96,130};
  if(png.length<sizeof(signature)+sizeof(end)||memcmp(png.bytes,signature,sizeof(signature))||memcmp((const unsigned char *)png.bytes+png.length-sizeof(end),end,sizeof(end)))CUFail(@"INVALID_CLIPBOARD_IMAGE",@"The screenshot must contain a complete PNG image.");
  [session check];
  NSDictionary *uncached=@{(id)kCGImageSourceShouldCache:@NO};
  CGImageSourceRef source=CGImageSourceCreateWithData((__bridge CFDataRef)png,(__bridge CFDictionaryRef)uncached);
  if(!source)CUFail(@"INVALID_CLIPBOARD_IMAGE",@"The screenshot PNG could not be read.");
  NSUInteger width=0,height=0;CGImageRef image=NULL;
  @try{
    CFStringRef type=CGImageSourceGetType(source);
    if(!type||!CFEqual(type,CFSTR("public.png"))||CGImageSourceGetCount(source)!=1)CUFail(@"INVALID_CLIPBOARD_IMAGE",@"Copy requires one PNG image.");
    NSDictionary *properties=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,(__bridge CFDictionaryRef)uncached));
    NSNumber *pixelWidth=properties[(id)kCGImagePropertyPixelWidth],*pixelHeight=properties[(id)kCGImagePropertyPixelHeight];
    if(![pixelWidth isKindOfClass:NSNumber.class]||![pixelHeight isKindOfClass:NSNumber.class]||pixelWidth.unsignedLongLongValue==0||pixelHeight.unsignedLongLongValue==0)CUFail(@"INVALID_CLIPBOARD_IMAGE",@"The screenshot PNG has no valid pixel dimensions.");
    if(pixelWidth.unsignedLongLongValue>maximumDimension||pixelHeight.unsignedLongLongValue>maximumDimension)CUFail(@"CLIPBOARD_IMAGE_TOO_LARGE",@"The screenshot exceeds the 16384-pixel dimension limit.");
    width=pixelWidth.unsignedIntegerValue;height=pixelHeight.unsignedIntegerValue;
    if(width>maximumPixels/height)CUFail(@"CLIPBOARD_IMAGE_TOO_LARGE",@"The screenshot exceeds the 32 Mi pixel limit.");
    // Decode eagerly before changing the pasteboard, including corrupt image data.
    NSDictionary *decode=@{(id)kCGImageSourceShouldCache:@YES,(id)kCGImageSourceShouldCacheImmediately:@YES,(id)kCGImageSourceShouldAllowFloat:@NO};
    image=CGImageSourceCreateImageAtIndex(source,0,(__bridge CFDictionaryRef)decode);
    if(!image||CGImageGetWidth(image)!=width||CGImageGetHeight(image)!=height||CGImageSourceGetStatus(source)!=kCGImageStatusComplete||CGImageSourceGetStatusAtIndex(source,0)!=kCGImageStatusComplete)CUFail(@"INVALID_CLIPBOARD_IMAGE",@"The screenshot PNG could not be completely decoded.");
  }@finally{if(image)CGImageRelease(image);CFRelease(source);}
  NSPasteboardItem *item=[NSPasteboardItem new];
  if(![item setData:png forType:NSPasteboardTypePNG])CUFail(@"CLIPBOARD_UNAVAILABLE",@"Could not prepare the screenshot for copying.");
  // Wait for temporary paste and its restoration while holding the same lock.
  int lock=CUClipboardLock(session,5);
  @try{
    CUPasteMain(^{
      [session check];NSPasteboard *pasteboard=NSPasteboard.generalPasteboard;
      [session check];NSInteger ownership=[pasteboard clearContents];
      if(pasteboard.changeCount!=ownership)CUFail(@"CLIPBOARD_CHANGED",@"The clipboard changed while copying the screenshot. Try again.");
      if(![pasteboard writeObjects:@[item]])CUFail(@"CLIPBOARD_UNAVAILABLE",@"Could not copy the screenshot to the clipboard.");
      ownership=pasteboard.changeCount;
      if(![[pasteboard dataForType:NSPasteboardTypePNG]isEqual:png]||pasteboard.changeCount!=ownership)CUFail(@"CLIPBOARD_CHANGED",@"The screenshot was not retained on the clipboard. Try again.");
    });
  }@finally{flock(lock,LOCK_UN);close(lock);}
  return CUResult(@{@"copied":@YES,@"width":@(width),@"height":@(height),@"pngBytes":@(png.length)});
}
NSDictionary *CUPaste(CUSession *session,NSDictionary *args,AXUIElementRef focused,void (^deliver)(void)) {
  NSString *text=args[@"text"],*html=args[@"html"];
  if(![text isKindOfClass:NSString.class]||(html&&![html isKindOfClass:NSString.class]))CUFail(@"INVALID_PASTE",@"Paste requires text and an optional HTML string.");
  if(!text.length&&!html.length)return CUResult(@{@"effect":@"unchanged"});
  int lock=CUClipboardLock(session,0);__block NSArray *saved;__block NSInteger ownership=-1;__block NSPasteboard *pasteboard;__block BOOL published=NO,populated=NO;
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
