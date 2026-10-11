#import "ScreenLockAuthorization.h"
#import <sys/socket.h>
#import <sys/un.h>
#import <sys/stat.h>
#import <sys/file.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

static NSError *CUAuthorizationError(NSString *description) {
  return [NSError errorWithDomain:CUScreenLockErrorDomain code:CUScreenLockAuthorizationRejected userInfo:@{NSLocalizedDescriptionKey:description}];
}

static NSError *CUUnlinkOwnSocket(NSString *socketPath,dev_t device,ino_t inode) {
  struct stat current={0};const char *path=socketPath.fileSystemRepresentation;
  if(lstat(path,&current)!=0)return errno==ENOENT?nil:CUAuthorizationError(@"Unable to inspect the provider socket during shutdown.");
  if(!S_ISSOCK(current.st_mode)||current.st_uid!=getuid()||current.st_dev!=device||current.st_ino!=inode)return CUAuthorizationError(@"The provider socket was replaced; shutdown refused to remove it.");
  return unlink(path)==0?nil:CUAuthorizationError(@"Unable to remove the stopped provider socket.");
}

static BOOL CUReclaimStaleSocket(NSString *socketPath,struct sockaddr_un *address,NSError **error) {
  struct stat previous={0};const char *path=socketPath.fileSystemRepresentation;
  if(lstat(path,&previous)!=0){if(errno==ENOENT)return YES;if(error)*error=CUAuthorizationError(@"Unable to inspect the provider socket path.");return NO;}
  if(!S_ISSOCK(previous.st_mode)||previous.st_uid!=getuid()||(previous.st_mode&0777)!=0600){if(error)*error=CUAuthorizationError(@"The provider socket path is occupied by an unknown or insecure object.");return NO;}
  int probe=socket(AF_UNIX,SOCK_STREAM,0);
  if(probe<0){if(error)*error=CUAuthorizationError(@"Unable to probe the existing provider socket.");return NO;}
  if(fcntl(probe,F_SETFD,FD_CLOEXEC)!=0||fcntl(probe,F_SETFL,O_NONBLOCK)!=0){close(probe);if(error)*error=CUAuthorizationError(@"Unable to safely probe the existing provider socket.");return NO;}
  int result=connect(probe,(struct sockaddr *)address,sizeof(*address));int probeError=errno;close(probe);
  // Only connection refusal proves an existing AF_UNIX socket has no active listener.
  if(result==0||probeError!=ECONNREFUSED){if(error)*error=CUAuthorizationError(@"The provider socket has an active or indeterminate listener; it will not be removed.");return NO;}
  struct stat current={0};
  if(lstat(path,&current)!=0||!S_ISSOCK(current.st_mode)||current.st_uid!=previous.st_uid||(current.st_mode&0777)!=0600||current.st_dev!=previous.st_dev||current.st_ino!=previous.st_ino){if(error)*error=CUAuthorizationError(@"The stale provider socket changed during recovery.");return NO;}
  NSError *failure=CUUnlinkOwnSocket(socketPath,previous.st_dev,previous.st_ino);if(error)*error=failure;return failure==nil;
}

@interface CULoginAuthorizationServer ()
@property CULoginAuthorizationBroker *broker;
@property dispatch_queue_t queue;
@property dispatch_source_t listener;
@property NSString *socketPath;
@property NSString *agentRequirement;
@property int socketFD;
@property dev_t socketDevice;
@property ino_t socketInode;
@property BOOL shuttingDown;
@property NSMutableArray<void (^)(NSError *)> *shutdownCompletions;
@end

@implementation CULoginAuthorizationServer
- (instancetype)initWithBroker:(CULoginAuthorizationBroker *)broker {
  if((self=[super init])){_broker=broker;_socketFD=-1;_shutdownCompletions=[NSMutableArray new];_queue=dispatch_queue_create("ai.trisoul.computer-use.login-socket",DISPATCH_QUEUE_SERIAL);dispatch_queue_set_specific(_queue,(__bridge const void *)_queue,(void *)1,NULL);}
  return self;
}
- (void)withQueue:(dispatch_block_t)work { if(dispatch_get_specific((__bridge const void *)self.queue))work();else dispatch_sync(self.queue,work); }
- (BOOL)startAtSocketPath:(NSString *)socketPath OSAgentRequirement:(NSString *)requirement error:(NSError **)error {
  __block BOOL started=NO;__block NSError *failure=nil;
  [self withQueue:^{
    if(self.listener||self.shuttingDown){failure=CUAuthorizationError(@"The login authorization socket is already active or shutting down.");return;}
    if(![socketPath hasPrefix:@"/"]||!requirement.length){failure=CUAuthorizationError(@"A trusted absolute socket path and OS-agent signature requirement are required.");return;}
    NSString *directory=socketPath.stringByDeletingLastPathComponent;
    struct stat parent={0};
    if(lstat(directory.fileSystemRepresentation,&parent)!=0||!S_ISDIR(parent.st_mode)||parent.st_uid!=getuid()||(parent.st_mode&0777)!=0700){
      failure=CUAuthorizationError(@"The provider socket directory must already be private, non-symlink, and owned by the helper user.");return;
    }
    char resolved[PATH_MAX];
    if(!realpath(directory.fileSystemRepresentation,resolved)||![directory isEqualToString:[NSString stringWithUTF8String:resolved]]){
      failure=CUAuthorizationError(@"The provider socket directory must not traverse symbolic links.");return;
    }
    struct sockaddr_un address={0};address.sun_family=AF_UNIX;address.sun_len=sizeof(address);
    const char *path=socketPath.fileSystemRepresentation;
    if(strlen(path)>=sizeof(address.sun_path)){failure=CUAuthorizationError(@"The provider socket path is too long.");return;}
    memcpy(address.sun_path,path,strlen(path)+1);
    NSString *lockPath=[directory stringByAppendingPathComponent:@".LoginAuthorization.lock"];
    int lockFD=open(lockPath.fileSystemRepresentation,O_RDWR|O_CREAT|O_NOFOLLOW|O_CLOEXEC,0600);
    struct stat lockIdentity={0},lockPathIdentity={0};
    if(lockFD<0||fstat(lockFD,&lockIdentity)!=0||lstat(lockPath.fileSystemRepresentation,&lockPathIdentity)!=0||!S_ISREG(lockIdentity.st_mode)||lockIdentity.st_uid!=getuid()||(lockIdentity.st_mode&0777)!=0600||lockIdentity.st_nlink!=1||lockIdentity.st_dev!=lockPathIdentity.st_dev||lockIdentity.st_ino!=lockPathIdentity.st_ino||flock(lockFD,LOCK_EX|LOCK_NB)!=0){
      if(lockFD>=0)close(lockFD);failure=CUAuthorizationError(@"Another provider is active or the private socket lock is insecure.");return;
    }
    @try {
    if(!CUReclaimStaleSocket(socketPath,&address,&failure))return;
    int fd=socket(AF_UNIX,SOCK_STREAM,0);
    if(fd<0){failure=CUAuthorizationError(@"Unable to create the provider socket.");return;}
    fcntl(fd,F_SETFD,FD_CLOEXEC);int noSigpipe=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&noSigpipe,sizeof(noSigpipe));
    if(bind(fd,(struct sockaddr *)&address,sizeof(address))!=0){close(fd);failure=CUAuthorizationError(@"Unable to bind the provider socket.");return;}
    if(chmod(path,0600)!=0||listen(fd,8)!=0||fcntl(fd,F_SETFL,O_NONBLOCK)!=0){close(fd);unlink(path);failure=CUAuthorizationError(@"Unable to secure the provider socket.");return;}
    struct stat bound={0};if(lstat(path,&bound)!=0||!S_ISSOCK(bound.st_mode)){close(fd);unlink(path);failure=CUAuthorizationError(@"The provider socket identity could not be established.");return;}
    self.socketPath=[socketPath copy];self.agentRequirement=[requirement copy];self.socketDevice=bound.st_dev;self.socketInode=bound.st_ino;self.socketFD=fd;
    dispatch_source_t listener=dispatch_source_create(DISPATCH_SOURCE_TYPE_READ,(uintptr_t)fd,0,self.queue);
    if(!listener){close(fd);unlink(path);self.socketFD=-1;failure=CUAuthorizationError(@"Unable to monitor the provider socket.");return;}
    self.listener=listener;__weak CULoginAuthorizationServer *server=self;
    dispatch_source_set_event_handler(listener,^{
      CULoginAuthorizationServer *live=server;if(!live)return;
      for(NSUInteger count=0;count<16;count++){
        int client=accept(fd,NULL,NULL);if(client<0)break;
        fcntl(client,F_SETFD,FD_CLOEXEC);setsockopt(client,SOL_SOCKET,SO_NOSIGPIPE,&noSigpipe,sizeof(noSigpipe));
        struct timeval timeout={.tv_sec=1,.tv_usec=0};setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));
        NSError *peerError=nil;
        BOOL trusted=CUVerifyScreenLockSocketPeer(client,live.agentRequirement,0,&peerError);
        BOOL consumed=trusted&&[live.broker consumePendingLoginAuthorizationAttempt];
        const char *response=consumed?"OMD_SCREEN_UNLOCK_V1 ALLOW\n":"OMD_SCREEN_UNLOCK_V1 DENY\n";
        size_t length=strlen(response),offset=0;
        while(offset<length){ssize_t sent=send(client,response+offset,length-offset,0);if(sent<0&&errno==EINTR)continue;if(sent<=0)break;offset+=(size_t)sent;}
        shutdown(client,SHUT_RDWR);close(client);
      }
    });
    dev_t device=bound.st_dev;ino_t inode=bound.st_ino;
    dispatch_source_set_cancel_handler(listener,^{
      close(fd);NSError *cleanup=CUUnlinkOwnSocket(socketPath,device,inode);close(lockFD);
      CULoginAuthorizationServer *live=server;if(!live)return;
      live.shuttingDown=NO;live.socketFD=-1;
      if(!cleanup){live.socketPath=nil;live.agentRequirement=nil;}
      NSArray *completions=[live.shutdownCompletions copy];[live.shutdownCompletions removeAllObjects];
      for(void (^completion)(NSError *) in completions)completion(cleanup);
    });dispatch_resume(listener);started=YES;
    } @finally { if(!started)close(lockFD); }
  }];
  if(error)*error=failure;return started;
}
- (void)cancel { [self shutdownWithCompletion:^(NSError *error){(void)error;}]; }
- (void)shutdownWithCompletion:(void (^)(NSError *))completion {
  [self.broker revokePendingLoginAuthorizationAttempt];
  dispatch_async(self.queue,^{
    if(self.shuttingDown){[self.shutdownCompletions addObject:[completion copy]];return;}
    if(!self.listener){NSError *error=self.socketPath?CUUnlinkOwnSocket(self.socketPath,self.socketDevice,self.socketInode):nil;if(!error){self.socketPath=nil;self.agentRequirement=nil;}completion(error);return;}
    self.shuttingDown=YES;[self.shutdownCompletions addObject:[completion copy]];
    dispatch_source_cancel(self.listener);self.listener=nil;
  });
}
- (NSDictionary *)snapshot {
  __block NSDictionary *state;[self withQueue:^{state=@{@"available":@(self.listener!=nil),@"authenticated_peer":@"OS audit token and code-signing requirement",@"socket":self.socketPath?:NSNull.null};}];return state;
}
- (void)dealloc {
  if(_listener)dispatch_source_cancel(_listener);
  if(_socketPath){struct stat current={0};const char *path=_socketPath.fileSystemRepresentation;if(lstat(path,&current)==0&&S_ISSOCK(current.st_mode)&&current.st_uid==getuid()&&current.st_dev==_socketDevice&&current.st_ino==_socketInode)unlink(path);}
}
@end
