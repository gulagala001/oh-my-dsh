#import <Foundation/Foundation.h>
#import <Security/AuthorizationPlugin.h>
#import "../computer-use/ScreenLockIdentity.h"
#import <sys/socket.h>
#import <sys/un.h>
#import <fcntl.h>
#import <poll.h>
#import <unistd.h>
#import <errno.h>

// The installer must provide a separate signed identity and a fixed socket path.
#ifndef CU_SCREEN_UNLOCK_SERVICE_IDENTIFIER
#define CU_SCREEN_UNLOCK_SERVICE_IDENTIFIER ""
#endif
#ifndef CU_SCREEN_UNLOCK_TEAM_IDENTIFIER
#define CU_SCREEN_UNLOCK_TEAM_IDENTIFIER ""
#endif
#ifndef CU_SCREEN_UNLOCK_SOCKET_PATH
#define CU_SCREEN_UNLOCK_SOCKET_PATH ""
#endif
#ifndef CU_SCREEN_UNLOCK_CERTIFICATE_SHA1
#define CU_SCREEN_UNLOCK_CERTIFICATE_SHA1 ""
#endif
#ifndef CU_SCREEN_UNLOCK_USER_ID
#define CU_SCREEN_UNLOCK_USER_ID (-1)
#endif

typedef struct { const AuthorizationCallbacks *callbacks; } CUAuthorizationPlugin;

@interface CUAuthorizationMechanism : NSObject
@property (assign) CUAuthorizationPlugin *plugin;
@property (assign) AuthorizationEngineRef engine;
@property BOOL deactivated;
@end
@implementation CUAuthorizationMechanism
@end

static OSStatus CUPluginDestroy(AuthorizationPluginRef plugin) { free(plugin);return errAuthorizationSuccess; }
static OSStatus CUMechanismCreate(AuthorizationPluginRef plugin,AuthorizationEngineRef engine,AuthorizationMechanismId name,AuthorizationMechanismRef *outMechanism) {
  if(!plugin||!engine||!outMechanism||!name||strcmp(name,"screen-unlock")!=0)return errAuthorizationInternal;
  CUAuthorizationMechanism *mechanism=[CUAuthorizationMechanism new];mechanism.plugin=plugin;mechanism.engine=engine;
  *outMechanism=(__bridge_retained void *)mechanism;return errAuthorizationSuccess;
}
static OSStatus CUMechanismInvoke(AuthorizationMechanismRef reference) {
  @autoreleasepool {
    CUAuthorizationMechanism *mechanism=(__bridge CUAuthorizationMechanism *)reference;
    if(!mechanism||mechanism.deactivated)return errAuthorizationInternal;
    AuthorizationResult result=kAuthorizationResultDeny;
    NSError *error=nil;
    NSString *requirement=strlen(CU_SCREEN_UNLOCK_CERTIFICATE_SHA1)?CUScreenLockPinnedSigningRequirement(@CU_SCREEN_UNLOCK_SERVICE_IDENTIFIER,@CU_SCREEN_UNLOCK_CERTIFICATE_SHA1,&error):CUScreenLockSigningRequirement(@CU_SCREEN_UNLOCK_SERVICE_IDENTIFIER,@CU_SCREEN_UNLOCK_TEAM_IDENTIFIER,&error);
    const char *path=CU_SCREEN_UNLOCK_SOCKET_PATH;
    if(requirement&&CU_SCREEN_UNLOCK_USER_ID>=0&&path[0]=='/'&&strlen(path)<sizeof(((struct sockaddr_un *)0)->sun_path)){
      int fd=socket(AF_UNIX,SOCK_STREAM,0);
      if(fd>=0){
        fcntl(fd,F_SETFD,FD_CLOEXEC);int flags=fcntl(fd,F_GETFL,0);BOOL connected=NO;
        struct timeval timeout={.tv_sec=2,.tv_usec=0};setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));
        struct sockaddr_un address={0};address.sun_family=AF_UNIX;address.sun_len=sizeof(address);memcpy(address.sun_path,path,strlen(path)+1);
        if(flags>=0&&fcntl(fd,F_SETFL,flags|O_NONBLOCK)==0){
          int status=connect(fd,(struct sockaddr *)&address,sizeof(address));
          if(status==0)connected=YES;
          else if(errno==EINPROGRESS){struct pollfd pending={.fd=fd,.events=POLLOUT};if(poll(&pending,1,2000)>0){int socketError=0;socklen_t length=sizeof(socketError);connected=getsockopt(fd,SOL_SOCKET,SO_ERROR,&socketError,&length)==0&&socketError==0;}}
          if(fcntl(fd,F_SETFL,flags)!=0)connected=NO;
        }
        if(connected&&CUVerifyScreenLockSocketPeer(fd,requirement,(uid_t)CU_SCREEN_UNLOCK_USER_ID,&error)){
          char response[64]={0};size_t offset=0;
          while(offset<sizeof(response)-1){ssize_t size=recv(fd,response+offset,sizeof(response)-1-offset,0);if(size<0&&errno==EINTR)continue;if(size<=0)break;offset+=(size_t)size;if(memchr(response,'\n',offset))break;}
          if(offset==strlen("OMD_SCREEN_UNLOCK_V1 ALLOW\n")&&memcmp(response,"OMD_SCREEN_UNLOCK_V1 ALLOW\n",offset)==0)result=kAuthorizationResultAllow;
        }
        close(fd);
      }
    }
    return mechanism.plugin->callbacks->SetResult(mechanism.engine,result);
  }
}
static OSStatus CUMechanismDeactivate(AuthorizationMechanismRef reference) {
  CUAuthorizationMechanism *mechanism=(__bridge CUAuthorizationMechanism *)reference;
  if(!mechanism)return errAuthorizationInternal;mechanism.deactivated=YES;
  return mechanism.plugin->callbacks->DidDeactivate(mechanism.engine);
}
static OSStatus CUMechanismDestroy(AuthorizationMechanismRef reference) {
  if(!reference)return errAuthorizationSuccess;
  __unused CUAuthorizationMechanism *mechanism=CFBridgingRelease(reference);return errAuthorizationSuccess;
}
static const AuthorizationPluginInterface CUPluginInterface={kAuthorizationPluginInterfaceVersion,CUPluginDestroy,CUMechanismCreate,CUMechanismInvoke,CUMechanismDeactivate,CUMechanismDestroy};

__attribute__((visibility("default"))) OSStatus AuthorizationPluginCreate(const AuthorizationCallbacks *callbacks,AuthorizationPluginRef *outPlugin,const AuthorizationPluginInterface **outInterface) {
  if(!callbacks||!callbacks->SetResult||!callbacks->DidDeactivate||!outPlugin||!outInterface)return errAuthorizationInternal;
  CUAuthorizationPlugin *plugin=calloc(1,sizeof(*plugin));if(!plugin)return errAuthorizationInternal;
  plugin->callbacks=callbacks;*outPlugin=plugin;*outInterface=&CUPluginInterface;return errAuthorizationSuccess;
}
