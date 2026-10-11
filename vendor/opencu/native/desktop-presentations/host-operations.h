#pragma once

#import <Foundation/Foundation.h>
#import "../transport/CUMachChannel.h"

NS_ASSUME_NONNULL_BEGIN

// Private main-process interface. The caller retains the borrowed send-right
// wrapper until the synchronous AppKit operation and acknowledgement finish.
@protocol OCUNativePresentationOperations <NSObject>
- (NSDictionary *)prepareNativeOperation:(NSDictionary *)payload
                              sendRight:(CUMachSendRight *)sendRight;
- (NSDictionary *)completeNativeOperation:(NSDictionary *)payload;
@end

NS_ASSUME_NONNULL_END
