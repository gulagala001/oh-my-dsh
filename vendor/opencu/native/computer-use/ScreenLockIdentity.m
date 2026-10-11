#import "ScreenLockIdentity.h"
#import <Security/Security.h>
#import <sys/socket.h>
#import <sys/un.h>
#import <unistd.h>

static NSError *CUIdentityError(NSString *description) {
  return [NSError errorWithDomain:@"ai.trisoul.computer-use.screen-lock" code:8 userInfo:@{NSLocalizedDescriptionKey:description}];
}

NSString *CUScreenLockPinnedSigningRequirement(NSString *identifier,NSString *certificateSHA1,NSError **error) {
  NSCharacterSet *identifierChars=[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"];
  NSCharacterSet *hashChars=[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"];
  if(!identifier.length||[identifier hasPrefix:@"com.openai."]||[identifier rangeOfCharacterFromSet:identifierChars.invertedSet].location!=NSNotFound||certificateSHA1.length!=40||[certificateSHA1 rangeOfCharacterFromSet:hashChars.invertedSet].location!=NSNotFound){if(error)*error=CUIdentityError(@"A separate signing identifier and the real signing certificate's SHA-1 pin are required.");return nil;}
  return [NSString stringWithFormat:@"identifier \"%@\" and certificate leaf = H\"%@\"",identifier,certificateSHA1.lowercaseString];
}

NSString *CUScreenLockSigningRequirement(NSString *identifier,NSString *teamIdentifier,NSError **error) {
  NSCharacterSet *identifierChars=[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"];
  NSCharacterSet *teamChars=[NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
  if(!identifier.length||[identifier rangeOfCharacterFromSet:identifierChars.invertedSet].location!=NSNotFound||
     teamIdentifier.length!=10||[teamIdentifier rangeOfCharacterFromSet:teamChars.invertedSet].location!=NSNotFound||
     [identifier hasPrefix:@"com.openai."]||[teamIdentifier isEqualToString:@"2DC432GLL2"]){
    if(error)*error=CUIdentityError(@"A separate real Developer ID identity is required for the screen-unlock provider.");return nil;
  }
  return [NSString stringWithFormat:@"anchor apple generic and identifier \"%@\" and certificate leaf[subject.OU] = \"%@\"",identifier,teamIdentifier];
}

BOOL CUVerifyScreenLockSocketPeer(int socketFD,NSString *requirementString,uid_t expectedUID,NSError **error) {
  uid_t uid;gid_t gid;
  if(!requirementString.length||getpeereid(socketFD,&uid,&gid)!=0||uid!=expectedUID){if(error)*error=CUIdentityError(@"The authorization socket peer has an unexpected user identity.");return NO;}
  audit_token_t auditToken={0};socklen_t tokenSize=sizeof(auditToken);
  if(getsockopt(socketFD,SOL_LOCAL,LOCAL_PEERTOKEN,&auditToken,&tokenSize)!=0||tokenSize!=sizeof(auditToken)){
    if(error)*error=CUIdentityError(@"The authorization socket peer audit token is unavailable.");return NO;
  }
  SecCodeRef code=NULL;SecRequirementRef requirement=NULL;
  NSDictionary *attributes=@{(__bridge NSString *)kSecGuestAttributeAudit:[NSData dataWithBytes:&auditToken length:sizeof(auditToken)]};
  OSStatus status=SecCodeCopyGuestWithAttributes(NULL,(__bridge CFDictionaryRef)attributes,kSecCSDefaultFlags,&code);
  if(status==errSecSuccess)status=SecRequirementCreateWithString((__bridge CFStringRef)requirementString,kSecCSDefaultFlags,&requirement);
  if(status==errSecSuccess)status=SecCodeCheckValidity(code,kSecCSDefaultFlags,requirement);
  if(code)CFRelease(code);if(requirement)CFRelease(requirement);
  if(status!=errSecSuccess){if(error)*error=CUIdentityError([NSString stringWithFormat:@"The authorization socket peer signature was rejected (%d).",(int)status]);return NO;}
  return YES;
}
