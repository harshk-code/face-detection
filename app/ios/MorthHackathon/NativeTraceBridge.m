#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeTrace, NSObject)
RCT_EXTERN_METHOD(log:(NSString *)event payload:(NSString *)payload)
@end
