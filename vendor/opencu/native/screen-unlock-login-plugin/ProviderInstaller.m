#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <CommonCrypto/CommonDigest.h>
#import "../computer-use/ScreenLockIdentity.h"
#import <sys/stat.h>
#import <sys/file.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

#ifndef CU_INSTALLER_CERTIFICATE_SHA1
#define CU_INSTALLER_CERTIFICATE_SHA1 ""
#endif
#ifndef CU_INSTALLER_HELPER_APP
#define CU_INSTALLER_HELPER_APP ""
#endif
#ifndef CU_INSTALLER_HELPER_SHA256
#define CU_INSTALLER_HELPER_SHA256 ""
#endif
#ifndef CU_INSTALLER_PLUGIN_SHA256
#define CU_INSTALLER_PLUGIN_SHA256 ""
#endif
#ifndef CU_INSTALLER_CONFIGURATION_SHA256
#define CU_INSTALLER_CONFIGURATION_SHA256 ""
#endif
#ifndef CU_INSTALLER_USER_ID
#define CU_INSTALLER_USER_ID -1
#endif

static NSString *const CUInstallerID=@"ai.trisoul.computer-use.screen-unlock.installer";
static NSString *const CUPluginID=@"ai.trisoul.computer-use.screen-unlock.authorization-plugin";
static NSString *const CUDirectory=@"/Library/Application Support/Oh My DSH/ScreenUnlock";
static NSString *const CUPluginPath=@"/Library/Security/SecurityAgentPlugins/OhMyDSHScreenUnlock.bundle";
static NSString *const CUConfigurationPath=@"/Library/Application Support/Oh My DSH/ScreenUnlock/provider.plist";
static NSString *const CUManifestPath=@"/Library/Application Support/Oh My DSH/ScreenUnlock/installation.json";
static NSString *const CUTopRight=@"system.login.screensaver";
static NSString *const CURemoteRight=@"ai.trisoul.computer-use.screen-unlock.allow";
static NSFileManager *CUFiles(void) { return NSFileManager.defaultManager; }
static void CUFail(NSString *message) { @throw [NSError errorWithDomain:@"ai.trisoul.computer-use.screen-unlock.installer" code:1 userInfo:@{NSLocalizedDescriptionKey:message}]; }
static void CUCheck(BOOL condition,NSString *message) { if(!condition)CUFail(message); }
static BOOL CUExists(NSString *path) { struct stat info={0};if(lstat(path.fileSystemRepresentation,&info)==0)return YES;CUCheck(errno==ENOENT,@"Unable to inspect the installation path.");return NO; }
static void CUCanonicalDirectory(NSString *path,BOOL protected) {
  struct stat info={0};char canonical[PATH_MAX];
  CUCheck(lstat(path.fileSystemRepresentation,&info)==0&&S_ISDIR(info.st_mode)&&realpath(path.fileSystemRepresentation,canonical)&&[path isEqualToString:[NSString stringWithUTF8String:canonical]],@"An installation directory is absent or traverses a symbolic link.");
  if(protected)CUCheck(info.st_uid==0&&!(info.st_mode&022),@"An installation directory is not protected root-owned storage.");
}
static NSString *CUHex(const unsigned char *bytes,NSUInteger length) { NSMutableString *hex=[NSMutableString new];for(NSUInteger i=0;i<length;i++)[hex appendFormat:@"%02x",bytes[i]];return hex; }
static NSString *CUSHA(NSData *data) { CUCheck(data.length<=UINT32_MAX,@"The installation asset is too large.");unsigned char hash[CC_SHA256_DIGEST_LENGTH];CC_SHA256(data.bytes,(CC_LONG)data.length,hash);return CUHex(hash,sizeof(hash)); }
static NSArray *CUByteSorted(NSArray *names) { return [names sortedArrayUsingComparator:^NSComparisonResult(NSString *a,NSString *b){NSData *left=[a dataUsingEncoding:NSUTF8StringEncoding],*right=[b dataUsingEncoding:NSUTF8StringEncoding];int result=memcmp(left.bytes,right.bytes,MIN(left.length,right.length));return result<0?NSOrderedAscending:result>0?NSOrderedDescending:left.length<right.length?NSOrderedAscending:left.length>right.length?NSOrderedDescending:NSOrderedSame;}]; }
static void CURejectUnsafeTree(NSString *path,BOOL protected) {
  struct stat info={0};CUCheck(lstat(path.fileSystemRepresentation,&info)==0&&(S_ISDIR(info.st_mode)||S_ISREG(info.st_mode)),@"The installation tree contains an unsupported or symbolic object.");
  if(protected)CUCheck(info.st_uid==0&&!(info.st_mode&022),@"The installation tree contains an unprotected object.");
  if(S_ISDIR(info.st_mode)){NSError *error=nil;NSArray *children=[CUFiles()contentsOfDirectoryAtPath:path error:&error];CUCheck(children!=nil,error.localizedDescription?:@"Unable to enumerate installation assets.");for(NSString *child in children)CURejectUnsafeTree([path stringByAppendingPathComponent:child],protected);}
}
static void CUHashTree(NSString *path,NSString *relative,CC_SHA256_CTX *context,NSUInteger *count) {
  struct stat info={0};CUCheck(++*count<=4096&&lstat(path.fileSystemRepresentation,&info)==0&&(S_ISDIR(info.st_mode)||S_ISREG(info.st_mode)),@"The signed payload tree is unsupported.");
  const char *kind=S_ISDIR(info.st_mode)?"D":"F";CC_SHA256_Update(context,kind,2);
  NSData *name=[relative dataUsingEncoding:NSUTF8StringEncoding];CUCheck(name!=nil,@"An installation asset path is invalid.");CC_SHA256_Update(context,name.bytes,(CC_LONG)name.length);unsigned char zero=0;CC_SHA256_Update(context,&zero,1);
  if(S_ISREG(info.st_mode)){CUCheck(info.st_size>=0&&info.st_size<=64*1024*1024,@"A signed payload file is too large.");NSError *error=nil;NSData *data=[NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:&error];CUCheck(data!=nil&&data.length<=64*1024*1024,error.localizedDescription?:@"Unable to read the signed payload.");NSString *size=[NSString stringWithFormat:@"%lu",(unsigned long)data.length];CC_SHA256_Update(context,size.UTF8String,(CC_LONG)strlen(size.UTF8String)+1);CC_SHA256_Update(context,data.bytes,(CC_LONG)data.length);}
  else {NSError *error=nil;NSArray *children=[CUFiles()contentsOfDirectoryAtPath:path error:&error];CUCheck(children!=nil,error.localizedDescription?:@"Unable to enumerate the signed payload.");for(NSString *child in CUByteSorted(children))CUHashTree([path stringByAppendingPathComponent:child],relative.length?[relative stringByAppendingFormat:@"/%@",child]:child,context,count);}
}
static NSString *CUTreeSHA(NSString *path) { CURejectUnsafeTree(path,NO);CC_SHA256_CTX context;CC_SHA256_Init(&context);NSUInteger count=0;CUHashTree(path,@"",&context,&count);unsigned char hash[CC_SHA256_DIGEST_LENGTH];CC_SHA256_Final(hash,&context);return CUHex(hash,sizeof(hash)); }
static void CUVerifyCode(NSString *path,NSString *identifier) {
  NSError *error=nil;NSString *text=CUScreenLockPinnedSigningRequirement(identifier,@CU_INSTALLER_CERTIFICATE_SHA1,&error);CUCheck(text!=nil,error.localizedDescription?:@"The installer has no own certificate identity.");
  SecStaticCodeRef code=NULL;SecRequirementRef requirement=NULL;OSStatus status=SecStaticCodeCreateWithPath((__bridge CFURLRef)[NSURL fileURLWithPath:path],kSecCSDefaultFlags,&code);
  if(status==errSecSuccess)status=SecRequirementCreateWithString((__bridge CFStringRef)text,kSecCSDefaultFlags,&requirement);
  if(status==errSecSuccess)status=SecStaticCodeCheckValidity(code,kSecCSStrictValidate|kSecCSCheckAllArchitectures|kSecCSCheckNestedCode,requirement);
  if(code)CFRelease(code);if(requirement)CFRelease(requirement);CUCheck(status==errSecSuccess,@"The own installer's code signature or signed payload was rejected.");
}
static NSDictionary *CUReadDictionary(NSString *path,BOOL json,BOOL protected,BOOL optional) {
  int fd=open(path.fileSystemRepresentation,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);if(fd<0&&errno==ENOENT&&optional)return nil;
  struct stat info={0};CUCheck(fd>=0,@"A required installation record is missing.");BOOL valid=fstat(fd,&info)==0&&S_ISREG(info.st_mode)&&info.st_size>0&&info.st_size<=1048576&&(!protected||(info.st_uid==0&&!(info.st_mode&022)));
  if(!valid){close(fd);CUFail(@"An installation record is insecure or invalid.");}
  NSMutableData *data=[NSMutableData dataWithLength:(NSUInteger)info.st_size];NSUInteger offset=0;
  while(offset<data.length){ssize_t length=read(fd,(char *)data.mutableBytes+offset,data.length-offset);if(length<0&&errno==EINTR)continue;if(length<=0)break;offset+=(NSUInteger)length;}close(fd);CUCheck(offset==data.length,@"An installation record was not read completely.");
  NSError *error=nil;id value=json?[NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:&error]:[NSPropertyListSerialization propertyListWithData:data options:NSPropertyListMutableContainers format:NULL error:&error];CUCheck([value isKindOfClass:NSDictionary.class],error.localizedDescription?:@"An installation record is not a dictionary.");return value;
}
static NSData *CUEncoded(id value,BOOL json) { NSError *error=nil;NSData *data=json?[NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingSortedKeys error:&error]:[NSPropertyListSerialization dataWithPropertyList:value format:NSPropertyListXMLFormat_v1_0 options:0 error:&error];CUCheck(data!=nil&&data.length<=1048576,error.localizedDescription?:@"An installation record could not be encoded.");return data; }
static void CUAtomicWrite(NSString *path,id value,BOOL json,mode_t mode) {
  CUCanonicalDirectory(path.stringByDeletingLastPathComponent,YES);NSString *temporary=[path.stringByDeletingLastPathComponent stringByAppendingPathComponent:[@".screen-unlock-write-" stringByAppendingString:NSUUID.UUID.UUIDString]];
  int fd=open(temporary.fileSystemRepresentation,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,mode);CUCheck(fd>=0,@"Unable to create a protected installation journal.");
  @try {NSData *data=CUEncoded(value,json);NSUInteger offset=0;while(offset<data.length){ssize_t written=write(fd,(const char *)data.bytes+offset,data.length-offset);if(written<0&&errno==EINTR)continue;CUCheck(written>0,@"Unable to write the installation journal.");offset+=(NSUInteger)written;}CUCheck(fsync(fd)==0,@"Unable to persist the installation journal.");close(fd);fd=-1;CUCheck(rename(temporary.fileSystemRepresentation,path.fileSystemRepresentation)==0,@"Unable to publish the installation journal.");}
  @finally {if(fd>=0)close(fd);unlink(temporary.fileSystemRepresentation);}
}
static NSDictionary *CURight(NSString *name,BOOL optional) { CFDictionaryRef value=NULL;OSStatus status=AuthorizationRightGet(name.UTF8String,&value);if(status==errAuthorizationDenied&&optional)return nil;CUCheck(status==errAuthorizationSuccess&&value!=NULL,@"Unable to read the actual authorization policy.");return CFBridgingRelease(value); }
static BOOL CUPolicyEqual(id left,id right) { if(left==NSNull.null)left=nil;if(right==NSNull.null)right=nil;if(!left||!right)return left==right;CUCheck([left isKindOfClass:NSDictionary.class]&&[right isKindOfClass:NSDictionary.class],@"An authorization policy is not a dictionary.");NSMutableDictionary *a=[left mutableCopy],*b=[right mutableCopy];[a removeObjectsForKeys:@[@"created",@"modified"]];[b removeObjectsForKeys:@[@"created",@"modified"]];return [CUEncoded(a,YES)isEqualToData:CUEncoded(b,YES)]; }
static void CUSetRight(NSString *name,NSDictionary *value) {
  NSTask *task=[NSTask new];task.executableURL=[NSURL fileURLWithPath:@"/usr/bin/security"];task.arguments=value?@[@"authorizationdb",@"write",name]:@[@"authorizationdb",@"remove",name];task.environment=@{@"PATH":@"/usr/bin:/bin:/usr/sbin:/sbin",@"LANG":@"C"};
  NSPipe *input=[NSPipe pipe],*output=[NSPipe pipe],*diagnostics=[NSPipe pipe];task.standardInput=input;task.standardOutput=output;task.standardError=diagnostics;NSError *error=nil;CUCheck([task launchAndReturnError:&error],error.localizedDescription?:@"The authorization policy writer could not start.");
  if(value)[input.fileHandleForWriting writeData:CUEncoded(value,NO)];[input.fileHandleForWriting closeFile];[output.fileHandleForReading readDataToEndOfFile];[diagnostics.fileHandleForReading readDataToEndOfFile];[task waitUntilExit];CUCheck(task.terminationReason==NSTaskTerminationReasonExit&&task.terminationStatus==0,@"The OS authorization policy update failed.");
}
static NSDictionary *CURemotePolicy(void) { return @{@"class":@"evaluate-mechanisms",@"mechanisms":@[@"OhMyDSHScreenUnlock:screen-unlock,privileged"],@"tries":@1,@"version":@1,@"comment":@"Own screen-unlock branch consumes one authorized Computer Use login attempt."}; }
static NSDictionary *CUTopPolicy(NSDictionary *before) { NSMutableDictionary *top=[before mutableCopy];top[@"class"]=@"rule";top[@"k-of-n"]=@1;top[@"rule"]=@[CURemoteRight,@"use-login-window-ui"];top[@"tries"]=@1;[top removeObjectForKey:@"mechanisms"];return top; }
static void CUCreateDirectories(void) {
  CUCanonicalDirectory(@"/Library",YES);CUCanonicalDirectory(@"/Library/Application Support",YES);
  for(NSString *path in @[@"/Library/Application Support/Oh My DSH",CUDirectory,@"/Library/Security",@"/Library/Security/SecurityAgentPlugins"]){if(!CUExists(path)){NSError *error=nil;CUCheck([CUFiles()createDirectoryAtPath:path withIntermediateDirectories:NO attributes:@{NSFilePosixPermissions:@0755}error:&error],error.localizedDescription?:@"Unable to create protected installation storage.");}CUCanonicalDirectory(path,YES);}
}
static void CUHarden(NSString *path) { struct stat info={0};CUCheck(lstat(path.fileSystemRepresentation,&info)==0&&(S_ISDIR(info.st_mode)||S_ISREG(info.st_mode)),@"The staged plugin contains an unsupported object.");CUCheck(chown(path.fileSystemRepresentation,0,0)==0&&chmod(path.fileSystemRepresentation,info.st_mode&07777&~022)==0,@"Unable to harden the own plugin.");if(S_ISDIR(info.st_mode)){NSError *error=nil;NSArray *children=[CUFiles()contentsOfDirectoryAtPath:path error:&error];CUCheck(children!=nil,error.localizedDescription?:@"Unable to harden plugin contents.");for(NSString *child in children)CUHarden([path stringByAppendingPathComponent:child]);} }
static NSDictionary *CUPayload(void) {
  NSString *bundle=NSBundle.mainBundle.bundlePath;CUCanonicalDirectory(bundle,NO);CUVerifyCode(bundle,CUInstallerID);
  NSString *helper=@CU_INSTALLER_HELPER_APP;CUCanonicalDirectory(helper,NO);CUVerifyCode(helper,@"ai.trisoul.computer-use");CUCheck([CUTreeSHA(helper)isEqual:@CU_INSTALLER_HELPER_SHA256],@"The helper changed after installer preparation; prepare again.");
  NSString *plugin=[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"OhMyDSHScreenUnlock.bundle"];CUVerifyCode(plugin,CUPluginID);CUCheck([CUTreeSHA(plugin)isEqual:@CU_INSTALLER_PLUGIN_SHA256],@"The signed plugin payload does not match the native installer.");
  NSString *configurationPath=[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:@"provider.plist"];NSData *data=[NSData dataWithContentsOfFile:configurationPath];CUCheck(data!=nil&&[CUSHA(data)isEqual:@CU_INSTALLER_CONFIGURATION_SHA256],@"The sealed provider configuration does not match the native installer.");
  NSDictionary *configuration=CUReadDictionary(configurationPath,NO,NO,NO);NSString *socketDirectory=[NSString stringWithFormat:@"/private/tmp/ai.trisoul.computer-use-screen-unlock-%d",CU_INSTALLER_USER_ID];
  CUCheck(CU_INSTALLER_USER_ID>0&&[configuration[@"format"]isEqual:@1]&&[configuration[@"userID"]isEqual:@(CU_INSTALLER_USER_ID)]&&[configuration[@"certificateSHA1"]isEqual:@CU_INSTALLER_CERTIFICATE_SHA1]&&[configuration[@"helperIdentifier"]isEqual:@"ai.trisoul.computer-use"]&&[configuration[@"pluginIdentifier"]isEqual:CUPluginID]&&[configuration[@"installedPlugin"]isEqual:CUPluginPath]&&[configuration[@"mechanism"]isEqual:@"OhMyDSHScreenUnlock:screen-unlock,privileged"]&&[configuration[@"socketDirectory"]isEqual:socketDirectory]&&[configuration[@"socketPath"]isEqual:[socketDirectory stringByAppendingPathComponent:@"LoginAuthorization.sock"]],@"The installer payload does not match its fixed identity, user and paths.");
  return configuration;
}
static void CUCheckpoint(NSMutableDictionary *manifest,NSString *step) { if(step){NSMutableDictionary *completed=manifest[@"recovery"][@"completed"];completed[step]=@YES;}CUAtomicWrite(CUManifestPath,manifest,YES,0644); }
static void CUInventory(NSString *path,NSString *relative,NSMutableArray *items) {
  struct stat info={0};CUCheck(items.count<512&&relative.length<=1024&&lstat(path.fileSystemRepresentation,&info)==0&&info.st_uid==0&&!(info.st_mode&022)&&(S_ISDIR(info.st_mode)||S_ISREG(info.st_mode))&&(uint64_t)info.st_ino<=9007199254740991ULL,@"The removal inventory contains an insecure or unsupported object.");
  NSMutableDictionary *item=[@{@"path":relative,@"device":@(info.st_dev),@"inode":@(info.st_ino),@"mode":@(info.st_mode),@"uid":@(info.st_uid),@"kind":S_ISDIR(info.st_mode)?@"directory":@"file"}mutableCopy];
  if(S_ISREG(info.st_mode)){CUCheck(info.st_size<=16*1024*1024&&info.st_nlink==1,@"The removal inventory contains an unexpected file.");NSData *data=[NSData dataWithContentsOfFile:path];CUCheck(data!=nil,@"Unable to read removal inventory content.");item[@"sha256"]=CUSHA(data);}[items addObject:item];
  if(S_ISDIR(info.st_mode)){NSError *error=nil;NSArray *children=[CUFiles()contentsOfDirectoryAtPath:path error:&error];CUCheck(children!=nil,error.localizedDescription?:@"Unable to enumerate removal inventory.");for(NSString *child in [children sortedArrayUsingSelector:@selector(compare:)])CUInventory([path stringByAppendingPathComponent:child],relative.length?[relative stringByAppendingFormat:@"/%@",child]:child,items);}
}
static BOOL CUKnownConfiguration(NSDictionary *expected) { if(!CUExists(CUConfigurationPath))return NO;CUCheck([CUReadDictionary(CUConfigurationPath,NO,YES,NO)isEqual:expected],@"The provider configuration changed; recovery refused to remove it.");return YES; }
static BOOL CUKnownBundle(NSDictionary *manifest) {
  if(!CUExists(CUPluginPath))return NO;CUCanonicalDirectory(CUPluginPath,YES);CURejectUnsafeTree(CUPluginPath,YES);
  NSDictionary *recovery=manifest[@"recovery"];
  if([recovery[@"completed"][@"bundleRemovalStarted"]boolValue]){NSArray *recorded=recovery[@"bundleRemovalInventory"];CUCheck([recorded isKindOfClass:NSArray.class]&&recorded.count&&[recorded[0][@"path"]isEqual:@""]&&[recorded[0][@"kind"]isEqual:@"directory"],@"A complete removal identity is required to resume deletion.");NSMutableDictionary *expected=[NSMutableDictionary new];for(NSDictionary *item in recorded)expected[item[@"path"]]=item;NSMutableArray *remaining=[NSMutableArray new];CUInventory(CUPluginPath,@"",remaining);for(NSDictionary *item in remaining)CUCheck([item isEqual:expected[item[@"path"]]],@"The partially removed bundle contains an unknown or changed object.");}
  else {CUVerifyCode(CUPluginPath,CUPluginID);NSString *hash=manifest[@"installedPluginSHA256"];CUCheck([hash isKindOfClass:NSString.class]&&[CUTreeSHA(CUPluginPath)isEqual:hash],@"The installed plugin changed outside this transaction.");}
  return YES;
}
static void CUValidateBackup(NSDictionary *manifest,NSDictionary *configuration) { CUCheck([manifest[@"format"]isEqual:@1]&&[@[@"installed",@"installing",@"rollback-required",@"uninstalling"]containsObject:manifest[@"state"]]&&[manifest[@"configuration"]isEqual:configuration]&&[manifest[@"beforeTop"]isKindOfClass:NSDictionary.class]&&manifest[@"beforeRemote"]==NSNull.null&&CUPolicyEqual(manifest[@"installedTop"],CUTopPolicy(manifest[@"beforeTop"]))&&CUPolicyEqual(manifest[@"installedRemote"],CURemotePolicy()),@"A complete matching own policy backup is required for recovery."); }
static NSDictionary *CURestore(NSMutableDictionary *manifest,NSDictionary *configuration,NSString *mode) {
  CUValidateBackup(manifest,configuration);NSDictionary *before=manifest[@"beforeTop"],*installed=manifest[@"installedTop"],*installedRemote=manifest[@"installedRemote"];
  NSDictionary *top=CURight(CUTopRight,NO),*remote=CURight(CURemoteRight,YES);CUCheck((CUPolicyEqual(top,before)||CUPolicyEqual(top,installed))&&(!remote||CUPolicyEqual(remote,installedRemote)),@"A policy is outside the recorded before/installed states; third-party changes are preserved.");CUKnownConfiguration(configuration);CUKnownBundle(manifest);
  manifest[@"state"]=[mode isEqual:@"uninstall"]?@"uninstalling":@"rollback-required";NSMutableDictionary *recovery=[manifest[@"recovery"]mutableCopy]?:[NSMutableDictionary new];recovery[@"mode"]=mode;recovery[@"completed"]=[recovery[@"completed"]mutableCopy]?:[NSMutableDictionary new];manifest[@"recovery"]=recovery;CUCheckpoint(manifest,nil);
  top=CURight(CUTopRight,NO);if(CUPolicyEqual(top,installed))CUSetRight(CUTopRight,before);else CUCheck(CUPolicyEqual(top,before),@"The screensaver policy changed during recovery.");CUCheck(CUPolicyEqual(CURight(CUTopRight,NO),before),@"The OS did not restore the full original screensaver policy.");CUCheckpoint(manifest,@"topRestored");
  NSError *error=nil;if(CUKnownConfiguration(configuration))CUCheck([CUFiles()removeItemAtPath:CUConfigurationPath error:&error],error.localizedDescription?:@"Unable to remove the provider configuration.");CUCheckpoint(manifest,@"configurationRemoved");
  remote=CURight(CURemoteRight,YES);if(CUPolicyEqual(remote,installedRemote))CUSetRight(CURemoteRight,nil);else CUCheck(remote==nil,@"The remote policy changed during recovery.");CUCheck(CURight(CURemoteRight,YES)==nil,@"The OS did not remove the recorded remote policy.");CUCheckpoint(manifest,@"remoteRestored");
  if(CUKnownBundle(manifest)){if(![recovery[@"completed"][@"bundleRemovalStarted"]boolValue]){NSMutableArray *inventory=[NSMutableArray new];CUInventory(CUPluginPath,@"",inventory);recovery[@"bundleRemovalInventory"]=inventory;CUCheckpoint(manifest,@"bundleRemovalStarted");}CUCheck([CUFiles()removeItemAtPath:CUPluginPath error:&error],error.localizedDescription?:@"Unable to finish removing the own plugin.");}CUCheckpoint(manifest,@"bundleRemoved");
  CUCheck(CUPolicyEqual(CURight(CUTopRight,NO),before)&&CURight(CURemoteRight,YES)==nil,@"A policy changed before recovery completed; the journal is retained.");CUCheck([CUFiles()removeItemAtPath:CUManifestPath error:&error],error.localizedDescription?:@"Unable to remove the completed recovery journal.");return @{@"installed":@NO,@"available":@NO,@"originalPolicyRestored":@YES};
}
static NSDictionary *CUInstall(NSDictionary *configuration) {
  NSMutableDictionary *existing=[CUReadDictionary(CUManifestPath,YES,YES,YES)mutableCopy];
  if(existing){CUValidateBackup(existing,configuration);CUCheck([existing[@"state"]isEqual:@"installed"],@"A previous transaction requires explicit recover or uninstall.");CUCheck(CUPolicyEqual(CURight(CUTopRight,NO),existing[@"installedTop"])&&CUPolicyEqual(CURight(CURemoteRight,YES),existing[@"installedRemote"])&&CUKnownConfiguration(configuration)&&CUKnownBundle(existing),@"The existing installation differs from its recorded policy or assets.");CUCheck([existing[@"installedPluginSHA256"]isEqual:@CU_INSTALLER_PLUGIN_SHA256],@"The prepared plugin differs from the existing installation; explicitly uninstall it before installing the new payload.");return @{@"installed":@YES,@"unchanged":@YES,@"available":@NO,@"restartRequired":@YES};}
  CUCheck(!CUExists(CUPluginPath)&&!CUExists(CUConfigurationPath),@"The fixed installation paths are occupied without an own journal.");NSDictionary *before=CURight(CUTopRight,NO);CUCheck(CURight(CURemoteRight,YES)==nil,@"The own remote policy exists without its installation journal.");
  NSMutableDictionary *manifest=[@{@"format":@1,@"state":@"installing",@"configuration":configuration,@"beforeTop":before,@"beforeRemote":NSNull.null,@"installedTop":CUTopPolicy(before),@"installedRemote":CURemotePolicy(),@"installedPluginSHA256":@CU_INSTALLER_PLUGIN_SHA256}mutableCopy];CUCheckpoint(manifest,nil);
  @try {
    NSString *temporary=[CUPluginPath.stringByDeletingLastPathComponent stringByAppendingPathComponent:[@".screen-unlock-install-" stringByAppendingString:NSUUID.UUID.UUIDString]];NSError *error=nil;
    CUCheck([CUFiles()createDirectoryAtPath:temporary withIntermediateDirectories:NO attributes:@{NSFilePosixPermissions:@0700}error:&error],error.localizedDescription?:@"Unable to stage the protected plugin.");
    @try {NSString *copy=[temporary stringByAppendingPathComponent:CUPluginPath.lastPathComponent];NSString *source=[NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:CUPluginPath.lastPathComponent];CUCheck([CUFiles()copyItemAtPath:source toPath:copy error:&error],error.localizedDescription?:@"Unable to copy the sealed plugin.");CUHarden(copy);CUVerifyCode(copy,CUPluginID);CUCheck([CUTreeSHA(copy)isEqual:@CU_INSTALLER_PLUGIN_SHA256],@"The copied plugin does not match the signed native payload.");CUCheck(!CUExists(CUPluginPath)&&rename(copy.fileSystemRepresentation,CUPluginPath.fileSystemRepresentation)==0,@"The plugin destination changed during installation.");}
    @finally {[CUFiles()removeItemAtPath:temporary error:NULL];}
    CUCheck(CUPolicyEqual(CURight(CUTopRight,NO),before),@"The screensaver policy changed during plugin staging.");CUSetRight(CURemoteRight,manifest[@"installedRemote"]);CUSetRight(CUTopRight,manifest[@"installedTop"]);CUCheck(CUPolicyEqual(CURight(CUTopRight,NO),manifest[@"installedTop"])&&CUPolicyEqual(CURight(CURemoteRight,NO),manifest[@"installedRemote"]),@"The OS did not retain the intended own policy.");
    CUAtomicWrite(CUConfigurationPath,configuration,NO,0644);manifest[@"state"]=@"installed";CUCheckpoint(manifest,nil);return @{@"installed":@YES,@"available":@NO,@"restartRequired":@YES,@"runtimeVerified":@NO,@"manualFallback":@"use-login-window-ui"};
  } @catch(id failure) {manifest[@"state"]=@"rollback-required";@try{CUCheckpoint(manifest,nil);CURestore(manifest,configuration,@"rollback");}@catch(id cleanup){(void)cleanup;CUFail(@"Installation failed; a protected journal remains for explicit recover or uninstall.");}@throw failure;}
}
static NSDictionary *CURootOperation(NSString *operation) {
  CUCheck(geteuid()==0,@"The root operation requires Authorization Services privilege.");NSDictionary *configuration=CUPayload();CUCreateDirectories();NSString *lockPath=[CUDirectory stringByAppendingPathComponent:@".installation.lock"];int fd=open(lockPath.fileSystemRepresentation,O_RDWR|O_CREAT|O_NOFOLLOW|O_CLOEXEC,0600);struct stat info={0};CUCheck(fd>=0,@"Unable to open the protected installation lock.");
  @try {CUCheck(fstat(fd,&info)==0&&S_ISREG(info.st_mode)&&info.st_uid==0&&(info.st_mode&0777)==0600&&info.st_nlink==1&&flock(fd,LOCK_EX|LOCK_NB)==0,@"Another installation is active or its lock is insecure.");if([operation isEqual:@"install"])return CUInstall(configuration);NSMutableDictionary *manifest=[CUReadDictionary(CUManifestPath,YES,YES,NO)mutableCopy];return CURestore(manifest,configuration,[operation isEqual:@"uninstall"]?@"uninstall":@"rollback");}
  @finally {close(fd);}
}
static NSDictionary *CUAuthorize(NSString *operation) {
  CUCheck(CU_INSTALLER_USER_ID>0&&geteuid()==(uid_t)CU_INSTALLER_USER_ID,@"The authorization launcher must run as its prepared helper user.");CUPayload();NSString *executable=NSBundle.mainBundle.executablePath;AuthorizationRef authorization=NULL;
  OSStatus status=AuthorizationCreate(NULL,kAuthorizationEmptyEnvironment,kAuthorizationFlagDefaults,&authorization);if(status!=errAuthorizationSuccess)return @{@"ok":@NO,@"operation":operation,@"authorizationStatus":@(status),@"error":@"Authorization creation failed."};
  @try {
    AuthorizationItem item={kAuthorizationRightExecute,strlen(executable.fileSystemRepresentation),(void *)executable.fileSystemRepresentation,0};AuthorizationRights rights={1,&item};
    status=AuthorizationCopyRights(authorization,&rights,kAuthorizationEmptyEnvironment,kAuthorizationFlagInteractionAllowed|kAuthorizationFlagExtendRights|kAuthorizationFlagPreAuthorize,NULL);
    if(status!=errAuthorizationSuccess)return @{@"ok":@NO,@"operation":operation,@"authorizationStatus":@(status),@"cancelled":@(status==errAuthorizationCanceled),@"error":@"Administrator authorization was cancelled or denied."};
    char *arguments[]={"root",(char *)operation.UTF8String,NULL};FILE *stream=NULL;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    // The recovered GUI installer uses this exact Authorization Services launch path.
    status=AuthorizationExecuteWithPrivileges(authorization,executable.fileSystemRepresentation,kAuthorizationFlagDefaults,arguments,&stream);
#pragma clang diagnostic pop
    if(status!=errAuthorizationSuccess||!stream)return @{@"ok":@NO,@"operation":operation,@"authorizationStatus":@(status),@"error":@"Authorized installer launch failed."};
    NSMutableData *output=[NSMutableData new];unsigned char buffer[4096];size_t size=0;while((size=fread(buffer,1,sizeof(buffer),stream))>0){if(output.length+size>1048576){fclose(stream);CUFail(@"The authorized installer response exceeded its limit.");}[output appendBytes:buffer length:size];}BOOL readError=ferror(stream)!=0;fclose(stream);CUCheck(!readError,@"The authorized installer response was interrupted.");
    NSError *error=nil;id response=[NSJSONSerialization JSONObjectWithData:output options:0 error:&error];CUCheck([response isKindOfClass:NSDictionary.class]&&[response[@"operation"]isEqual:operation]&&[response[@"ok"]isKindOfClass:NSNumber.class],@"The authorized installer did not confirm a valid operation result.");return response;
  } @finally {AuthorizationFree(authorization,kAuthorizationFlagDefaults);}
}
int main(int argc,const char *argv[]) {
  @autoreleasepool {
    NSString *operation=argc==3?[NSString stringWithUTF8String:argv[2]]:@"";NSDictionary *response=nil;
    @try {CUCheck(argc==3&&[@[@"install",@"uninstall",@"recover"]containsObject:operation],@"Only fixed install, uninstall and recover operations are supported.");NSString *mode=[NSString stringWithUTF8String:argv[1]];
      if([mode isEqual:@"authorize"])response=CUAuthorize(operation);
      else {CUCheck([mode isEqual:@"root"],@"The installer invocation mode is invalid.");response=@{@"ok":@YES,@"operation":operation,@"result":CURootOperation(operation)};}
    } @catch(id error) {NSString *message=[error respondsToSelector:@selector(localizedDescription)]?[error localizedDescription]:@"The fixed installer operation failed.";struct stat journal={0};response=@{@"ok":@NO,@"operation":operation,@"error":message,@"recoveryRequired":@(lstat(CUManifestPath.fileSystemRepresentation,&journal)==0)};}
    NSData *data=CUEncoded(response,YES);fwrite(data.bytes,1,data.length,stdout);fputc('\n',stdout);return [response[@"ok"]boolValue]?0:2;
  }
}
