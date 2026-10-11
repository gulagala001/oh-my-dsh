#import <Foundation/Foundation.h>

@class CUSession;

// Authenticated user action only; pngBase64 is a complete PNG, at most 2 MiB.
NSDictionary *CUCopyImageToClipboard(CUSession *session, NSDictionary *args);
