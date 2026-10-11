#import "ComputerUse.h"
#import "InputFocus.h"
#import "WindowRegistry.h"
#import "WindowScreenshot.h"
#import <ImageIO/ImageIO.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreText/CoreText.h>
#import <libproc.h>
#import <dlfcn.h>
#import <objc/runtime.h>

extern int32_t CUObservationFirstCharacterIsNumber(const unichar *characters,int64_t length);
extern int64_t CUObservationCharacterCount(const unichar *characters,int64_t length);
extern int64_t CUObservationPrefixUTF16Length(const unichar *characters,int64_t length,int64_t count);
extern int32_t CUObservationCharacterIsLF(const unichar *characters,int64_t length,int32_t last);
extern int32_t CUObservationStringsEqual(const unichar *left,int64_t leftLength,const unichar *right,int64_t rightLength);

@interface CUAXPartialValue : NSObject
@property(strong) id value;
@property(strong) NSNumber *arrayCount;
@property(strong) NSArray<NSValue *> *availableRanges;
@property(strong) NSNumber *textCount;
@property(strong) NSValue *textRange;
@end
@implementation CUAXPartialValue
@end
@interface CUAXTransaction : NSObject {
@public CFMutableDictionaryRef records;
}
@end
@implementation CUAXTransaction
- (instancetype)init { if((self=[super init]))records=CFDictionaryCreateMutable(NULL,0,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);return self; }
- (void)dealloc { if(records)CFRelease(records); }
@end
static NSString *const CUAXTransactionThreadKey=@"ai.trisoul.computer-use.ax-transaction";
static CUAXPartialValue *CUAXCapturedPartial(AXUIElementRef element,CFStringRef attribute) {
  CUAXTransaction *transaction=NSThread.currentThread.threadDictionary[CUAXTransactionThreadKey];
  NSDictionary *attributes=transaction?(__bridge NSDictionary *)CFDictionaryGetValue(transaction->records,element):nil;
  return attributes[(__bridge NSString *)attribute];
}
static id CUAXCaptured(AXUIElementRef element,CFStringRef attribute) {
  CUAXPartialValue *partial=CUAXCapturedPartial(element,attribute);return partial?(partial.value==NSNull.null?nil:partial.value):CUAX(element,attribute);
}

@interface CUAXURLContext : NSObject
@property(strong) NSNumber *individualLimit;
@property(strong) NSNumber *totalLimit;
@property BOOL includeQuery;
@property BOOL includeFragment;
@property NSUInteger accumulated;
@property(strong) NSMutableSet<NSURL *> *usedURLs;
- (NSString *)trim:(NSURL *)url isImage:(BOOL)isImage;
- (BOOL)compact;
- (void)reset;
@end
@interface CUAXNode : NSObject
@property(strong) CUElement *element;
@property(strong) NSMutableDictionary *row;
@property(strong) NSDictionary *signature;
@property(strong) NSMutableDictionary *attributes;
@property(strong) NSDictionary *sourceAttributes;
@property(strong) NSArray<NSString *> *supportedAttributes;
@property(strong) NSDictionary *originalRow;
@property(strong) NSMutableArray<CUAXNode *> *children;
@property(strong) NSArray<CUAXNode *> *sourceChildren;
@property(strong) NSNumber *renderedId;
@property(copy) NSString *text;
@property(copy) NSString *detailText;
@property BOOL hasAvailableSubset;
@property(strong) NSNumber *availableSubsetCount;
@property(strong) NSArray<NSValue *> *availableSubsetRanges;
@property BOOL stringValueEligible;
@property BOOL catalyst;
@property BOOL focusOnly;
@property NSUInteger contextType;
@property(strong) NSValue *truncationRange;
@property(strong) CUAXURLContext *urlContext;
@property(strong) NSURL *valueURL;
@property(strong) NSAttributedString *attributedValue;
@property(strong) NSArray *valueSourceOffsets;
@property(strong) NSArray *titleTargets;
@end
@implementation CUAXNode
- (instancetype)init { if((self=[super init]))_children=[NSMutableArray new];return self; }
@end
@interface CUAXRevision : NSObject
@property(copy) NSString *identifier;
@property(copy) NSString *previousIdentifier;
@property(strong) NSArray<CUAXNode *> *sources;
@property(strong) NSArray<CUAXNode *> *roots;
@property(strong) NSArray<CUAXNode *> *renders;
@property(strong) NSArray<CUAXNode *> *focusRoots;
@property(strong) NSArray<CUAXNode *> *focusRenders;
@property(strong) NSArray *changes;
@property(strong) NSArray *cumulativeChanges;
@property(strong) NSArray<CUAXNode *> *initialRoots;
@property(copy) NSString *initialIdentifier;
@property(strong) NSDictionary *captureArguments;
@end
@implementation CUAXRevision
@end
static char CUAXRevisionKey,CUAXSourceCaptureKey,CUAXSignatureKey,CUAXRetiredReferenceKey,CUAXResolvedWindowInfoKey,CUAXSessionAppCapturesKey,CUAXAppCaptureOwnerKey,CUAXAppMappingKey,CUAXAppDiffingKey;
static BOOL CUAXReferenceIsRetired(CUElement *element) { return element&&[objc_getAssociatedObject(element,&CUAXRetiredReferenceKey)boolValue]; }
static BOOL CUAXUsesAppContext(NSDictionary *args) {
  id value=args[@"is_app_context"];return value&&CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID()&&[value boolValue];
}
static id CUAXCaptureOwner(CUWindow *target) { return objc_getAssociatedObject(target,&CUAXAppCaptureOwnerKey)?:target; }
static CUAXRevision *CUAXRecordedRevision(CUWindow *target,BOOL source) { return objc_getAssociatedObject(CUAXCaptureOwner(target),source?&CUAXSourceCaptureKey:&CUAXRevisionKey); }
static void CUAXRecordRevision(CUWindow *target,CUAXRevision *revision,BOOL source) { objc_setAssociatedObject(CUAXCaptureOwner(target),source?&CUAXSourceCaptureKey:&CUAXRevisionKey,revision,OBJC_ASSOCIATION_RETAIN_NONATOMIC); }
static void CURecordScreenshotMapping(CUWindow *target,CGRect rect,double pointsPerPixel) {
  target.sourceVisibleRect=rect;target.sourcePointsPerPixel=pointsPerPixel;
  target.screenshotScale=pointsPerPixel>0?1./pointsPerPixel:0;target.screenshotBounds=rect;
  id owner=CUAXCaptureOwner(target);
  if(owner!=target)objc_setAssociatedObject(owner,&CUAXAppMappingKey,@{@"rect":[NSValue valueWithRect:rect],@"pointsPerPixel":@(pointsPerPixel)},OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}
BOOL CUHasRecordedAXCapture(CUWindow *target) { return CUAXRecordedRevision(target,YES)!=nil||CUAXRecordedRevision(target,NO)!=nil; }
static void CUAXFlatten(NSArray<CUAXNode *> *roots,NSMutableArray<CUAXNode *> *out) {
  for(CUAXNode *node in roots){[out addObject:node];CUAXFlatten(node.children,out);}
}
static BOOL CUAXDescriptive(CUAXNode *node) {
  for(NSString *key in @[@"title",@"description",@"value",@"placeholder"]){id value=node.attributes[key];if([value isKindOfClass:NSString.class]&&[value length])return YES;}
  return [node.row[@"role"]isEqual:@"AXImage"];
}
static NSString *CUAXStringAttribute(CUAXNode *node,NSString *key) {
  id value=node.attributes[key];return [value isKindOfClass:NSString.class]?value:nil;
}
static NSString *CUAXStringValue(CUAXNode *node) { return node.stringValueEligible?CUAXStringAttribute(node,@"value"):nil; }
static NSString *CUAXShortURL(NSURL *url,CUAXURLContext *context);
static NSUInteger CUAXCharacterCount(NSString *string);
static NSUInteger CUAXPrefixUTF16Length(NSString *string,NSInteger count);
static BOOL CUAXStringsEqual(NSString *left,NSString *right);
static void CUAXApplyAttributedText(CUAXNode *node);
static void CUAXApplyWebAreaAttributedText(CUAXNode *node);
static BOOL CUAXLongAttribute(NSString *string) {
  return [string containsString:@"\n"]||CUAXCharacterCount(string)>=101;
}
static NSString *CUAXNativeDescription(CUAXNode *node) {
  NSString *role=node.row[@"role"],*roleDescription=CUAXStringAttribute(node,@"role_description");
  if(!roleDescription){if([role isEqual:@"AXMenu"])roleDescription=@"menu";else if([role isEqual:@"AXMenuBar"])roleDescription=@"menu bar";else if([@[@"AXMenuBarItem",@"AXMenuItem",@"AXRadioGroup"]containsObject:role])roleDescription=@"";else roleDescription=@"unknown";}
  else if([@[@"AXMenuBarItem",@"AXMenuItem",@"AXRadioGroup"]containsObject:role])roleDescription=@"";
  else if([role isEqual:@"AXRow"])roleDescription=@"row";else if([role isEqual:@"AXGenericElement"]&&!roleDescription.length)roleDescription=@"element";else if([role isEqual:@"AXGroup"])roleDescription=@"container";
  NSMutableArray *attributes=[NSMutableArray new];NSMutableSet *seen=[NSMutableSet new];
  void (^add)(NSString *,NSString *,BOOL)=^(NSString *label,NSString *value,BOOL deduplicate){if(!value.length||(deduplicate&&[seen containsObject:value]))return;[seen addObject:value];[attributes addObject:@{@"label":label?:@"",@"value":value,@"long":@(CUAXLongAttribute(value))}];};
  add(nil,CUAXStringAttribute(node,@"title"),YES);add(@"Description",CUAXStringAttribute(node,@"description"),YES);
  for(NSString *key in @[@"row_index_range",@"column_index_range"]){NSArray *range=node.row[key];if(range.count==2&&[range[0]integerValue]>=0&&[range[0]integerValue]<[range[1]integerValue])add([key isEqual:@"row_index_range"]?@"Rows":@"Columns",[NSString stringWithFormat:@"%@-%@",range[0],range[1]],NO);}
  if(![role isEqual:@"AXImage"]&&[node.attributes[@"url"]isKindOfClass:NSURL.class])add(@"URL",CUAXShortURL(node.attributes[@"url"],node.urlContext),YES);
  for(NSArray *pair in @[@[@"help",@"Help"],@[@"value",@"Value"],@[@"value_description",@"Details"],@[@"placeholder",@"Placeholder"]])add(pair[1],CUAXStringAttribute(node,pair[0]),YES);
  NSString *identifier=CUAXStringAttribute(node,@"identifier");if(![identifier hasPrefix:@"_"]&&![identifier hasPrefix:@"NS"])add(@"ID",identifier,YES);
  NSMutableArray *secondary=[NSMutableArray new];for(NSDictionary *action in node.row[@"action_descriptions"]){NSString *name=action[@"name"],*description=action[@"description"];if([@[@"AXPress",@"AXShowMenu",@"AXScrollToVisible"]containsObject:name]||[@[@"Add comment",@"Remove unused rows",@"Remove unused columns",@"Remove unused rows and columns"]containsObject:description])continue;[secondary addObject:description];}if(secondary.count)add(@"Secondary Actions",[secondary componentsJoinedByString:@", "],YES);
  NSMutableArray *shortAttributes=[NSMutableArray new],*longAttributes=[NSMutableArray new],*parts=[NSMutableArray new];
  if(attributes.count==1&&![attributes[0][@"label"]isEqual:@"Secondary Actions"])[parts addObject:attributes[0][@"value"]];
  else{for(NSDictionary *attribute in attributes){NSString *label=attribute[@"label"],*value=attribute[@"value"];NSString *text=label.length?[NSString stringWithFormat:@"%@: %@",label,value]:value;[[attribute[@"long"]boolValue]?longAttributes:shortAttributes addObject:text];}[shortAttributes addObjectsFromArray:longAttributes];if(shortAttributes.count)[parts addObject:[shortAttributes componentsJoinedByString:@", "]];}
  if(roleDescription.length)[parts insertObject:roleDescription atIndex:0];NSMutableArray *qualifiers=[NSMutableArray new];
  if([node.row[@"selectable"]boolValue]&&![node.row[@"selected"]boolValue])[qualifiers addObject:@"selectable"];
  if([node.row[@"selected"]boolValue])[qualifiers addObject:@"selected"];
  if(![node.row[@"enabled"]boolValue]&&![@[@"AXGroup",@"AXStaticText"]containsObject:role])[qualifiers addObject:@"disabled"];
  if([node.row[@"disclosable"]boolValue])[qualifiers addObject:[node.row[@"disclosing"]boolValue]?@"expanded":@"collapsed"];
  if([node.row[@"value_settable"]boolValue]){NSString *type=node.row[@"value_type_name"];[qualifiers addObject:[type isEqual:@"string"]?@"settable":[NSString stringWithFormat:@"settable, %@",type]];}
  if([node.row[@"sent_by_current_user"]boolValue])[qualifiers addObject:@"sent by me"];
  if(qualifiers.count)[parts addObject:[NSString stringWithFormat:@"(%@)",[qualifiers componentsJoinedByString:@", "]]];return [parts componentsJoinedByString:@" "];
}
static NSString *CUAXRenderText(CUAXNode *node) { return CUAXNativeDescription(node); }
static void CUAXSetAttribute(CUAXNode *node,NSString *key,NSString *value) {
  node.attributes[key]=value?:NSNull.null;
  if([key isEqual:@"role"])node.row[@"role"]=value?:@"AXUnknown";
  if([key isEqual:@"value"]){node.valueURL=nil;node.attributedValue=nil;node.valueSourceOffsets=nil;if(value)node.row[@"value"]=value;else[node.row removeObjectForKey:@"value"];}
  if([key isEqual:@"title"]||[key isEqual:@"description"]){NSString *title=CUAXStringAttribute(node,@"title");node.row[@"label"]=title.length?title:(CUAXStringAttribute(node,@"description")?:@"");}
}
static CUAXNode *CUAXCopyNode(CUAXNode *source,BOOL subtree) {
  CUAXNode *node=[CUAXNode new];node.element=source.element;node.row=[source.row mutableCopy];node.signature=source.signature;node.attributes=[source.attributes mutableCopy];node.sourceAttributes=source.sourceAttributes;node.supportedAttributes=source.supportedAttributes;node.originalRow=source.originalRow;node.sourceChildren=source.sourceChildren;node.titleTargets=source.titleTargets;node.hasAvailableSubset=source.hasAvailableSubset;node.availableSubsetCount=source.availableSubsetCount;node.availableSubsetRanges=source.availableSubsetRanges;node.stringValueEligible=source.stringValueEligible;node.catalyst=source.catalyst;node.contextType=source.contextType;node.truncationRange=source.truncationRange;node.urlContext=source.urlContext;node.valueURL=source.valueURL;node.attributedValue=source.attributedValue;node.valueSourceOffsets=source.valueSourceOffsets;node.text=source.text;node.detailText=source.detailText;
  node.focusOnly=source.focusOnly;
  if(subtree)for(CUAXNode *child in source.children)[node.children addObject:CUAXCopyNode(child,YES)];return node;
}
static CUAXNode *CUAXCopyOriginalItem(CUAXNode *source,NSMutableSet<NSString *> *seen,NSUInteger depth) {
  if(depth>200||[seen containsObject:source.element.identifier])return nil;[seen addObject:source.element.identifier];
  CUAXNode *node=CUAXCopyNode(source,NO);node.row=[source.originalRow mutableCopy];node.attributes=[source.sourceAttributes mutableCopy];node.valueURL=nil;node.attributedValue=nil;node.valueSourceOffsets=nil;
  for(CUAXNode *child in source.sourceChildren){CUAXNode *copy=CUAXCopyOriginalItem(child,seen,depth+1);if(copy)[node.children addObject:copy];}return node;
}
static CUAXNode *CUAXCopyOriginalNode(CUAXNode *source) { return CUAXCopyOriginalItem(source,[NSMutableSet new],0); }
static NSString *CUAXFlattenedString(CUAXNode *node,NSString *key) {
  NSMutableArray *nodes=[NSMutableArray new],*strings=[NSMutableArray new];CUAXFlatten(@[node],nodes);
  for(CUAXNode *item in nodes){NSString *value=[([key isEqual:@"string_value"]?CUAXStringValue(item):CUAXStringAttribute(item,key)) stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];if(value.length)[strings addObject:value];}
  return [strings componentsJoinedByString:@"\n"];
}
static BOOL CUAXSubtreeDescriptive(CUAXNode *node) {
  for(NSString *key in @[@"title",@"description",@"value",@"placeholder"])if(CUAXFlattenedString(node,key).length)return YES;
  return [node.row[@"role"]isEqual:@"AXImage"];
}
static BOOL CUAXFocusableOrSelectable(CUAXNode *node) { return [node.row[@"focusable"]boolValue]||[node.row[@"selectable"]boolValue]; }
static BOOL CUAXInterestingActions(CUAXNode *node) {
  for(NSString *action in node.row[@"actions"])if(![@[@"AXScrollToVisible",@"AXShowMenu"]containsObject:action])return YES;
  return NO;
}
static BOOL CUAXHasDescendant(CUAXNode *node,BOOL (^predicate)(CUAXNode *)) {
  for(CUAXNode *child in node.children)if(predicate(child)||CUAXHasDescendant(child,predicate))return YES;return NO;
}
static BOOL CUAXCanBeUserInteractive(CUAXNode *node) {
  NSString *role=node.row[@"role"];
  if([role isEqual:@"AXStaticText"])return CUAXFocusableOrSelectable(node);
  if([role isEqual:@"AXTextArea"]||[role isEqual:@"AXGroup"])return [node.row[@"focusable"]boolValue];return YES;
}
static CUAXNode *CUAXChildForAX(CUAXNode *node,id ax) {
  if(!ax||CFGetTypeID((__bridge CFTypeRef)ax)!=AXUIElementGetTypeID())return nil;
  for(CUAXNode *child in node.children)if(CFEqual(child.element.ax,(__bridge CFTypeRef)ax))return child;return nil;
}
static void CUAXAssociateTitles(CUAXNode *node) {
  NSMutableArray *sources=[NSMutableArray new];for(CUAXNode *child in node.children)[sources addObject:CUAXCopyNode(child,YES)];for(CUAXNode *source in sources){CUAXNode *label=nil;for(CUAXNode *child in node.children)if([child.element.identifier isEqual:source.element.identifier]){label=child;break;}if(!label||!source.titleTargets.count)continue;
    if(source.titleTargets.count==1){NSMutableArray *strings=[NSMutableArray new];for(NSString *key in @[@"value",@"title",@"description"]){NSString *value=CUAXStringAttribute(source,key);if(value)[strings addObject:value];}
      CUAXNode *target=CUAXChildForAX(node,source.titleTargets[0]);if(strings.count==1&&target&&target.signature[@"title"]==NSNull.null){CUAXSetAttribute(target,@"title",strings[0]);[node.children removeObjectIdenticalTo:label];continue;}
    }
    if(!source.children.count){NSMutableArray *targets=[NSMutableArray new];for(id ax in source.titleTargets){CUAXNode *target=CUAXChildForAX(node,ax);if(target)[targets addObject:target];}
      if(targets.count==source.titleTargets.count){for(CUAXNode *target in targets)[target.children addObject:CUAXCopyOriginalNode(source)];[node.children removeObjectIdenticalTo:label];}
    }
  }
}
static void CUAXFlattenSelectableAncestor(CUAXNode *node) {
  if(![node.row[@"selectable"]boolValue]||[node.row[@"focused"]boolValue]||[node.row[@"role"]isEqual:@"AXTable"]||[node.attributes[@"subrole"]isEqual:@"AXTableRow"]||node.hasAvailableSubset)return;
  if(CUAXHasDescendant(node,^BOOL(CUAXNode *child){return [child.row[@"value_settable"]boolValue]||[child.row[@"selectable"]boolValue];}))return;
  NSString *description=CUAXFlattenedString(node,@"description"),*value=CUAXFlattenedString(node,@"string_value"),*title=CUAXFlattenedString(node,@"title");
  BOOL focusable=CUAXHasDescendant(node,^BOOL(CUAXNode *child){return [child.row[@"focusable"]boolValue];});NSMutableArray *descendants=[NSMutableArray new],*kept=[NSMutableArray new];CUAXFlatten(node.children,descendants);
  for(CUAXNode *child in descendants)if(![child.row[@"role"]isEqual:@"AXMenu"])[kept addObject:CUAXCopyOriginalNode(child)];
  node.row[@"focusable"]=@(focusable);CUAXSetAttribute(node,@"description",description);CUAXSetAttribute(node,@"value",value);CUAXSetAttribute(node,@"title",title);node.children=kept;
}
static void CUAXFlattenRepetitive(CUAXNode *node) {
  NSString *description=CUAXStringAttribute(node,@"description"),*value=CUAXStringValue(node);BOOL changed;
  do{changed=NO;for(NSUInteger remaining=node.children.count;remaining;remaining--){NSUInteger index=remaining-1;CUAXNode *child=node.children[index];
    NSString *childDescription=[CUAXStringAttribute(child,@"description")stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSString *childValue=[CUAXStringValue(child)stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if((childDescription.length&&[description containsString:childDescription])||(childValue.length&&[value containsString:childValue])){[node.children replaceObjectsInRange:NSMakeRange(index,1) withObjectsFromArray:child.children];changed=YES;}
  }}while(changed);
}
static NSDictionary *CUAXFlattenedRole(CUAXNode *node) {
  NSString *role=node.row[@"role"];
  if([role isEqual:@"AXStaticText"])return @{@"separator":@" ",@"description":@"text",@"target_description":@"text"};
  if([role isEqual:@"AXRadioButton"])return @{@"separator":@"; ",@"description":@"radio button",@"target_description":@"radio buttons"};
  if([role isEqual:@"AXRow"])return @{@"separator":@"; ",@"description":@"outline row",@"target_description":@"rows"};return nil;
}
static void CUAXMergeTextSiblings(CUAXNode *node) {
  NSMutableArray<NSValue *> *runs=[NSMutableArray new];NSUInteger start=NSNotFound;
  for(NSUInteger i=0;i<=node.children.count;i++){BOOL eligible=i<node.children.count&&[node.children[i].row[@"role"]isEqual:@"AXStaticText"]&&CUAXStringValue(node.children[i])!=nil;
    if(eligible&&start==NSNotFound)start=i;
    if(!eligible&&start!=NSNotFound){if(i-start>1)[runs addObject:[NSValue valueWithRange:NSMakeRange(start,i-start)]];start=NSNotFound;}
  }
  for(NSValue *run in runs.reverseObjectEnumerator){NSRange range=run.rangeValue;CUAXNode *first=node.children[range.location];NSDictionary *role=CUAXFlattenedRole(first);if(!role)continue;
    NSMutableArray *strings=[NSMutableArray new];for(NSUInteger i=range.location;i<NSMaxRange(range);i++){NSString *value=CUAXStringValue(node.children[i]);if([value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length)[strings addObject:value];}
    CUAXNode *merged=CUAXCopyNode(first,NO);CUAXSetAttribute(merged,@"role_description",role[@"target_description"]);CUAXSetAttribute(merged,CUAXStringValue(merged)?@"value":@"description",[strings componentsJoinedByString:role[@"separator"]]);
    [node.children replaceObjectsInRange:range withObjectsFromArray:@[merged]];
  }
}
static NSString *CUAXURLString(NSURL *url,CUAXURLContext *context,NSUInteger *accumulated) {
  NSString *scheme=url.scheme.lowercaseString;if(!scheme.length||[scheme isEqual:@"data"]||[scheme isEqual:@"webdoc"])return nil;
  if(url.isFileURL)return url.absoluteString;
  NSURLComponents *components=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];if(!components)return nil;
  if([components.scheme isEqual:@"http"]||[components.scheme isEqual:@"https"])components.scheme=nil;
  if([components.host hasPrefix:@"www."])components.host=[components.host substringFromIndex:4];
  if(!context.includeQuery)components.query=nil;if(!context.includeFragment)components.fragment=nil;
  NSString *string=components.string;if([string hasPrefix:@"//"])string=[string substringFromIndex:2];if(!string)return nil;
  if(context.individualLimit&&CUAXCharacterCount(string)>context.individualLimit.unsignedIntegerValue){NSUInteger limit=context.individualLimit.unsignedIntegerValue;NSUInteger end=CUAXPrefixUTF16Length(string,(NSInteger)limit-1);string=[[string substringToIndex:end]stringByAppendingString:@"\u2026"];}
  NSUInteger count=CUAXCharacterCount(string);if(*accumulated>NSUIntegerMax-count)CUFail(@"URL_LENGTH_OVERFLOW",@"Accessibility URL text is too long.");
  if(context.totalLimit&&*accumulated+count>context.totalLimit.unsignedIntegerValue){if(*accumulated==NSUIntegerMax)CUFail(@"URL_LENGTH_OVERFLOW",@"Accessibility URL text is too long.");(*accumulated)++;return @"\u2026";}
  *accumulated+=count;return string;
}
@implementation CUAXURLContext
- (instancetype)init { if((self=[super init])){_includeQuery=YES;_includeFragment=YES;_usedURLs=[NSMutableSet new];}return self; }
- (NSString *)trim:(NSURL *)url isImage:(BOOL)isImage { if(!url)return nil;[self.usedURLs addObject:url];if(isImage)return nil;NSUInteger count=self.accumulated;NSString *value=CUAXURLString(url,self,&count);self.accumulated=count;return value; }
- (BOOL)compact {
  BOOL changed=NO;if(!self.totalLimit){self.totalLimit=@4000;changed=YES;}
  for(;;){NSUInteger count=0;for(NSURL *url in self.usedURLs)CUAXURLString(url,self,&count);if(count<=self.totalLimit.unsignedIntegerValue)return changed;
    if(self.includeFragment){self.includeFragment=NO;changed=YES;continue;}
    if(self.includeQuery){self.includeQuery=NO;changed=YES;continue;}
    NSUInteger limit=self.individualLimit?self.individualLimit.unsignedIntegerValue:130;if(limit<=20)return changed;self.individualLimit=@(MIN(120,limit-10));changed=YES;
  }
}
- (void)reset { self.accumulated=0;[self.usedURLs removeAllObjects]; }
@end
static NSString *CUAXShortURL(NSURL *url,CUAXURLContext *context) { return [context trim:url isImage:NO]; }
static void CUAXFlattenLink(CUAXNode *node) {
  if(![node.row[@"role"]isEqual:@"AXLink"]||![node.attributes[@"url"]isKindOfClass:NSURL.class])return;
  NSURL *url=node.attributes[@"url"];NSString *string=CUAXShortURL(url,node.urlContext);if(!string.length)return;
  CUAXSetAttribute(node,@"role",@"AXStaticText");CUAXSetAttribute(node,@"role_description",@"link");CUAXSetAttribute(node,@"value",string);node.valueURL=url;node.attributes[@"url"]=NSNull.null;[node.children removeAllObjects];
}
static CUAXNode *CUAXApplyTransformation(CUAXNode *node,NSUInteger transformation,BOOL *replaced) {
  if(transformation==0)CUAXAssociateTitles(node);
  if(transformation==1)CUAXFlattenSelectableAncestor(node);
  if(transformation==2){
    if(node.contextType!=0&&!node.children.count&&!CUAXDescriptive(node)&&![node.row[@"focused"]boolValue]&&![node.row[@"selected"]boolValue]&&![node.row[@"disclosing"]boolValue])return nil;
    if(!CUAXFocusableOrSelectable(node)&&!CUAXInterestingActions(node)&&!CUAXSubtreeDescriptive(node)
       &&!CUAXHasDescendant(node,^BOOL(CUAXNode *child){return CUAXFocusableOrSelectable(child)||CUAXInterestingActions(child);}))return nil;
  }
  if(transformation==3){
    if(![node.row[@"enabled"]boolValue]&&![node.row[@"focused"]boolValue]&&!node.children.count&&!CUAXSubtreeDescriptive(node))return nil;
  }
  if(transformation==4&&[node.row[@"role"]isEqual:@"AXGroup"]&&![node.row[@"selectable"]boolValue]&&![node.row[@"focused"]boolValue]&&!CUAXDescriptive(node)){
    if(!node.children.count&&!node.hasAvailableSubset)return nil;
    if(node.children.count==1&&!node.children[0].hasAvailableSubset){*replaced=YES;return node.children[0];}
  }
  if(transformation==5&&![node.row[@"selectable"]boolValue]&&![node.row[@"focused"]boolValue]&&!CUAXDescriptive(node)){
    NSString *parent=[node.row[@"render_attributes_known"]boolValue]?CUAXNativeDescription(node):nil;if(parent)for(NSUInteger remaining=node.children.count;remaining;remaining--){NSUInteger index=remaining-1;CUAXNode *child=node.children[index];if([child.row[@"render_attributes_known"]boolValue]&&!child.hasAvailableSubset&&[node.row[@"role"]isEqual:child.row[@"role"]]&&[parent isEqual:CUAXNativeDescription(child)])[node.children replaceObjectsInRange:NSMakeRange(index,1) withObjectsFromArray:child.children];}
  }
  if(transformation==6&&!CUAXFocusableOrSelectable(node)&&!CUAXHasDescendant(node,^BOOL(CUAXNode *child){return CUAXCanBeUserInteractive(child);}))CUAXFlattenRepetitive(node);
  if(transformation==7)CUAXFlattenLink(node);
  if(transformation==8&&!CUAXFocusableOrSelectable(node))CUAXMergeTextSiblings(node);
  return node;
}
static void CUAXFilterMacActions(CUAXNode *node) {
  NSMutableArray *descriptions=[NSMutableArray new],*names=[NSMutableArray new];NSString *role=node.row[@"role"];
  for(NSDictionary *action in node.row[@"action_descriptions"]){NSString *name=action[@"name"];BOOL keep=YES;
    if([@[@"AXShowAlternateUI",@"AXShowDefaultUI"]containsObject:name])keep=NO;
    else if([name isEqual:@"AXCancel"])keep=!node.catalyst&&![@[@"AXMenuBar",@"AXMenuItem"]containsObject:role];
    else if([name isEqual:@"AXPick"])keep=![role isEqual:@"AXMenuItem"];
    else if([name isEqual:@"AXConfirm"])keep=![role isEqual:@"AXTextField"];
    else if([@[@"AXIncrement",@"AXDecrement"]containsObject:name])keep=![node.row[@"value_settable"]boolValue];
    else if([@[@"AXScrollLeftByPage",@"AXScrollRightByPage"]containsObject:name])keep=CUAXCaptured(node.element.ax,kAXHorizontalScrollBarAttribute)!=nil;
    else if([@[@"AXScrollUpByPage",@"AXScrollDownByPage"]containsObject:name])keep=CUAXCaptured(node.element.ax,kAXVerticalScrollBarAttribute)!=nil;
    if(keep){[descriptions addObject:action];[names addObject:name];}
  }
  node.row[@"action_descriptions"]=descriptions;node.row[@"actions"]=names;
}
static CUAXNode *CUAXTransformItem(CUAXNode *node) {
  for(NSUInteger transformation=0;transformation<9;){
    if(transformation==0&&node.contextType==0)CUAXFilterMacActions(node);
    BOOL replaced=NO;node=CUAXApplyTransformation(node,transformation,&replaced);if(!node)return nil;
    // Native replaced results restart all passes on the replacement item.
    transformation=replaced?0:transformation+1;
  }
  // Mac tag 10 follows the nine core passes and only contracts Calendar events.
  if([node.row[@"role"]isEqual:@"AXStaticText"]&&[CUAXStringAttribute(node,@"role_description")isEqual:@"Event"]&&node.children.count==1&&[node.children[0].row[@"role"]isEqual:@"AXStaticText"]){
    pid_t pid=0;if(AXUIElementGetPid(node.element.ax,&pid)==kAXErrorSuccess&&[[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier isEqual:@"com.apple.iCal"])[node.children removeAllObjects];
  }
  CUAXApplyAttributedText(node);
  CUAXApplyWebAreaAttributedText(node);
  return node;
}
static NSArray<CUAXNode *> *CUAXTransformNodes(NSArray<CUAXNode *> *nodes) {
  NSMutableArray *out=[NSMutableArray new];
  for(CUAXNode *source in nodes){
    CUAXNode *node=CUAXTransformItem(source);if(!node)continue;
    // Each parent's full pipeline precedes recursion into its resulting children.
    node.children=[CUAXTransformNodes(node.children)mutableCopy];
    [out addObject:node];
  }return out;
}
static void CUAXTrimValueURLs(NSArray<CUAXNode *> *nodes) {
  for(CUAXNode *node in nodes){if(node.valueURL){NSString *value=CUAXShortURL(node.valueURL,node.urlContext)?:@"";node.attributes[@"value"]=value;node.row[@"value"]=value;}CUAXTrimValueURLs(node.children);}
}
static NSArray<CUAXNode *> *CUAXRenderNodes(NSArray<CUAXNode *> *nodes,NSUInteger depth) {
  NSMutableArray *rendered=[NSMutableArray new];
  for(CUAXNode *node in nodes){node.text=CUAXRenderText(node);node.detailText=nil;
    // The source renderer maps an omitted item's path to its nearest rendered parent.
    if(!node.text.length){[rendered addObjectsFromArray:CUAXRenderNodes(node.children,depth)];continue;}
    node.row[@"depth"]=@(depth);
    if(node.availableSubsetCount){NSMutableArray *ranges=[NSMutableArray new];for(NSValue *value in node.availableSubsetRanges){NSRange range=value.rangeValue;if(range.location>NSUIntegerMax-range.length)CUFail(@"AX_RANGE_OVERFLOW",@"An accessibility subset range is invalid.");[ranges addObject:[NSString stringWithFormat:@"%lu-%lu",range.location,range.location+range.length]];}node.detailText=[NSString stringWithFormat:@"(showing %@ of %@ items)",[ranges componentsJoinedByString:@", "],node.availableSubsetCount];}
    node.children=[CUAXRenderNodes(node.children,depth+1)mutableCopy];[rendered addObject:node];
  }return rendered;
}
static NSString *CUAXRenderLine(CUAXNode *node) {
  NSString *text=node.detailText&&node.contextType!=2?[NSString stringWithFormat:@"%@ %@",node.text,node.detailText]:node.text;
  NSString *indent=[@""stringByPaddingToLength:[node.row[@"depth"]unsignedIntegerValue] withString:@"\t" startingAtIndex:0];
  return [NSString stringWithFormat:@"%@%@ %@",indent,node.renderedId,text];
}
static id CUAXDiffIdentity(CUAXNode *node,BOOL snapshot) { return snapshot?node.renderedId:node.element.identifier; }
static NSSet *CUAXRetainedIDs(NSArray<CUAXNode *> *nodes,NSDictionary *old,BOOL snapshot) {
  NSMutableArray *pairs=[NSMutableArray new];NSInteger last=-1;BOOL ordered=YES;
  for(CUAXNode *node in nodes){id identity=CUAXDiffIdentity(node,snapshot);NSDictionary *entry=old[identity];if(!entry)continue;NSInteger position=[entry[@"offset"]integerValue];if(position<=last)ordered=NO;last=position;[pairs addObject:@{@"id":identity,@"position":@(position)}];}
  if(ordered)return nil;
  // Native matching uses strict LIS suffix lengths, then the earliest forward tie.
  NSMutableArray<NSNumber *> *tails=[NSMutableArray new],*lengths=[NSMutableArray new];for(NSUInteger i=0;i<pairs.count;i++)[lengths addObject:@0];
  for(NSUInteger remaining=pairs.count;remaining;remaining--){NSUInteger i=remaining-1;NSInteger value=-[pairs[i][@"position"]integerValue];NSUInteger lo=0,hi=tails.count;
    while(lo<hi){NSUInteger mid=lo+(hi-lo)/2;if(tails[mid].integerValue<value)lo=mid+1;else hi=mid;}
    if(lo==tails.count)[tails addObject:@(value)];else tails[lo]=@(value);lengths[i]=@(lo+1);
  }
  NSMutableSet *result=[NSMutableSet new];NSUInteger needed=tails.count;last=-1;
  for(NSUInteger i=0;i<pairs.count&&needed;i++){NSInteger position=[pairs[i][@"position"]integerValue];if(position>last&&lengths[i].unsignedIntegerValue>=needed){[result addObject:pairs[i][@"id"]];last=position;needed--;}}
  return result;
}
static void CUAXSubtreeChange(NSMutableArray *changes,CUAXNode *node,NSString *kind) {
  [changes addObject:@{@"node":node,@"kind":kind}];for(CUAXNode *child in node.children)CUAXSubtreeChange(changes,child,kind);
}
static void CUAXPairChange(NSMutableArray *changes,NSMutableArray *queue,CUAXNode *old,CUAXNode *fresh,BOOL snapshot) {
  if(!snapshot)fresh.renderedId=old.renderedId;
  [changes addObject:@{@"node":fresh,@"kind":CUAXStringsEqual(fresh.text,old.text)?@"none":@"update"}];
  if(old.children.count||fresh.children.count)[queue addObject:@[old.children,fresh.children]];
}
static NSArray *CUAXChanges(NSArray<CUAXNode *> *oldRoots,NSArray<CUAXNode *> *newRoots,BOOL snapshot) {
  NSMutableArray *changes=[NSMutableArray new],*queue=[NSMutableArray arrayWithObject:@[oldRoots,newRoots]];
  for(NSUInteger cursor=0;cursor<queue.count;cursor++){
    NSArray<CUAXNode *> *old=queue[cursor][0],*fresh=queue[cursor][1];NSUInteger prefix=0;
    while(prefix<MIN(old.count,fresh.count)&&[CUAXDiffIdentity(old[prefix],snapshot)isEqual:CUAXDiffIdentity(fresh[prefix],snapshot)]){CUAXPairChange(changes,queue,old[prefix],fresh[prefix],snapshot);prefix++;}
    NSMutableDictionary *index=[NSMutableDictionary new];for(NSUInteger i=prefix;i<old.count;i++)index[CUAXDiffIdentity(old[i],snapshot)]=@{@"offset":@(i),@"node":old[i]};
    NSArray *suffix=[fresh subarrayWithRange:NSMakeRange(prefix,fresh.count-prefix)];NSSet *retained=CUAXRetainedIDs(suffix,index,snapshot);
    for(CUAXNode *node in suffix){id identity=CUAXDiffIdentity(node,snapshot);NSDictionary *entry=index[identity];[index removeObjectForKey:identity];
      if(entry&&(!retained||[retained containsObject:identity]))CUAXPairChange(changes,queue,entry[@"node"],node,snapshot);
      else CUAXSubtreeChange(changes,node,@"insert");
    }
    for(NSDictionary *entry in index.allValues)CUAXSubtreeChange(changes,entry[@"node"],@"remove");
  }return changes;
}
static CUAXRevision *CUAXBuildRevision(CUWindow *capture,NSArray<NSMutableDictionary *> *rows,CUAXRevision *previous,NSDictionary *args,BOOL enableAXDiffing,BOOL incomplete,NSNumber *focusedIndex,NSArray<NSNumber *> *selectedIndexes,BOOL selectedLeaves) {
  CUAXRevision *revision=[CUAXRevision new];revision.identifier=capture.snapshotId;revision.captureArguments=args;
  NSUInteger contextType=[args[@"context_type"]unsignedIntegerValue];
  CUAXURLContext *context=[CUAXURLContext new];
  NSMutableArray<CUAXNode *> *sources=[NSMutableArray new],*roots=[NSMutableArray new],*parents=[NSMutableArray new];NSMutableDictionary<NSNumber *,CUAXNode *> *byIndex=[NSMutableDictionary new];
  for(NSMutableDictionary *row in rows){CUAXNode *node=[CUAXNode new];node.element=capture.elements[row[@"element_index"]];node.signature=row[@"_signature"]?:@{};node.sourceAttributes=row[@"_attributes"]?:node.signature;node.stringValueEligible=[row[@"_string_value_eligible"]boolValue];node.catalyst=[row[@"_catalyst"]boolValue];node.truncationRange=row[@"_truncation_range"];node.urlContext=context;node.titleTargets=row[@"_title_targets"]?:@[];[row removeObjectForKey:@"_signature"];[row removeObjectForKey:@"_attributes"];[row removeObjectForKey:@"_string_value_eligible"];[row removeObjectForKey:@"_catalyst"];[row removeObjectForKey:@"_truncation_range"];[row removeObjectForKey:@"_title_targets"];node.row=row;node.originalRow=[row copy];node.attributes=[node.sourceAttributes mutableCopy];node.hasAvailableSubset=incomplete;
    BOOL focusOnly=[row[@"_focus_only"]boolValue];node.focusOnly=focusOnly;[row removeObjectForKey:@"_focus_only"];node.originalRow=[row copy];NSUInteger depth=[row[@"depth"]unsignedIntegerValue];while(parents.count>depth)[parents removeLastObject];if(parents.count)[parents.lastObject.children addObject:node];else if(!focusOnly)[roots addObject:node];[parents addObject:node];[sources addObject:node];byIndex[row[@"element_index"]]=node;
  }
  for(CUAXNode *node in sources){node.contextType=contextType;node.supportedAttributes=node.row[@"_supported_attributes"]?:@[];[node.row removeObjectForKey:@"_supported_attributes"];node.hasAvailableSubset=[node.row[@"_available_subset"]boolValue];node.availableSubsetCount=node.row[@"_available_subset_count"];node.availableSubsetRanges=node.row[@"_available_subset_ranges"];for(NSString *key in @[@"_available_subset",@"_available_subset_count",@"_available_subset_ranges"])[node.row removeObjectForKey:key];node.originalRow=[node.row copy];node.sourceChildren=[node.children copy];}
  CUAXNode *focused=focusedIndex?byIndex[focusedIndex]:nil;if(CUAXReferenceIsRetired(focused.element))focused=nil;NSMutableArray *focusRoots=[NSMutableArray new];if(focused){CUAXNode *focus=CUAXCopyNode(focused,NO);for(NSNumber *index in selectedIndexes){CUAXNode *selected=byIndex[index];if(selected&&!CUAXReferenceIsRetired(selected.element))[focus.children addObject:CUAXCopyNode(selected,!selectedLeaves)];}[focusRoots addObject:focus];}
  revision.sources=sources;revision.roots=CUAXTransformNodes(roots);revision.focusRoots=CUAXTransformNodes(focusRoots);
  NSNumber *individual=context.individualLimit,*total=context.totalLimit;BOOL query=context.includeQuery,fragment=context.includeFragment;
  if([context compact]){[context reset];CUAXTrimValueURLs(revision.roots);CUAXTrimValueURLs(revision.focusRoots);context.individualLimit=individual;context.totalLimit=total;context.includeQuery=query;context.includeFragment=fragment;}
  revision.roots=CUAXRenderNodes(revision.roots,0);revision.focusRoots=CUAXRenderNodes(revision.focusRoots,0);
  NSMutableArray *renders=[NSMutableArray new],*focusRenders=[NSMutableArray new];CUAXFlatten(revision.roots,renders);CUAXFlatten(revision.focusRoots,focusRenders);revision.renders=renders;revision.focusRenders=focusRenders;
  BOOL initial=!previous||!enableAXDiffing;if(!initial)CUAXChanges(previous.roots,revision.roots,NO);revision.previousIdentifier=initial?nil:previous.identifier;
  revision.initialRoots=initial?revision.roots:(previous.initialRoots?:previous.roots);revision.initialIdentifier=initial?revision.identifier:(previous.initialIdentifier?:previous.identifier);
  // Missing IDs follow the inherited current-tree maximum, not a historical counter.
  NSInteger maximum=0;for(CUAXNode *node in renders)if(node.renderedId)maximum=MAX(maximum,node.renderedId.integerValue);
  NSMutableDictionary *ids=[NSMutableDictionary new];NSUInteger ordinal=0;
  for(CUAXNode *node in renders){if(initial)node.renderedId=@(ordinal++);else if(!node.renderedId){node.renderedId=ids[node.element.identifier];if(!node.renderedId){if(maximum==NSIntegerMax)CUFail(@"ELEMENT_ID_OVERFLOW",@"Accessibility element IDs are exhausted.");node.renderedId=@(++maximum);}}ids[node.element.identifier]=node.renderedId;node.row[@"rendered_id"]=node.renderedId;node.row[@"render_text"]=node.text;}
  if(initial)for(CUAXNode *node in renders)maximum=MAX(maximum,node.renderedId.integerValue);
  for(CUAXNode *node in focusRenders){node.renderedId=ids[node.element.identifier];if(!node.renderedId){if(maximum==NSIntegerMax)CUFail(@"ELEMENT_ID_OVERFLOW",@"Accessibility element IDs are exhausted.");node.renderedId=@(++maximum);}ids[node.element.identifier]=node.renderedId;node.row[@"rendered_id"]=node.renderedId;node.row[@"render_text"]=node.text;}
  for(CUAXNode *node in [renders arrayByAddingObjectsFromArray:focusRenders]){node.row[@"render_line"]=CUAXRenderLine(node);if(node.detailText)node.row[@"render_detail_text"]=node.detailText;else[node.row removeObjectForKey:@"render_detail_text"];}
  NSMutableArray *publicChanges=[NSMutableArray new];if(!initial)for(NSDictionary *change in CUAXChanges(previous.roots,revision.roots,YES)){CUAXNode *node=change[@"node"];if(node.renderedId)[publicChanges addObject:@{@"kind":change[@"kind"],@"rendered_id":node.renderedId}];}revision.changes=publicChanges;
  NSMutableArray *cumulative=[NSMutableArray new];if(!initial)for(NSDictionary *change in CUAXChanges(revision.initialRoots,revision.roots,YES)){CUAXNode *node=change[@"node"];if(node.renderedId)[cumulative addObject:@{@"kind":change[@"kind"],@"rendered_id":node.renderedId}];}revision.cumulativeChanges=cumulative;
  return revision;
}

@implementation CUElement
- (instancetype)initWithElement:(AXUIElementRef)element { if((self=[super init])){_ax=(AXUIElementRef)CFRetain(element);_identifier=NSUUID.UUID.UUIDString;}return self; }
- (void)dealloc { if(_ax)CFRelease(_ax); }
@end
@implementation CUWindow
- (instancetype)init { if((self=[super init])){_elements=[NSMutableDictionary new];_screenshotScale=0;_sourceVisibleRect=CGRectNull;}return self; }
@end
@implementation CUSession
- (instancetype)init { if((self=[super init])){atomic_init(&cancelled,false);_ownerID=NSUUID.UUID.UUIDString;_label=NSUUID.UUID.UUIDString;_windows=[NSMutableDictionary new];_active=dispatch_group_create();_queue=dispatch_queue_create("ai.trisoul.computer-use.session",DISPATCH_QUEUE_SERIAL);_writeLock=[NSLock new];}return self; }
- (void)check { if(atomic_load(&cancelled))CUFail(@"CANCELLED",@"Computer Use session was stopped."); }
@end
void CUFail(NSString *code,NSString *message) { @throw [NSException exceptionWithName:code reason:message userInfo:nil]; }
id CUAX(AXUIElementRef element,CFStringRef attribute) {
  __block CFTypeRef value=NULL;__block AXError error=kAXErrorFailure;pid_t pid=0;AXUIElementGetPid(element,&pid);
  void (^read)(void)=^{error=AXUIElementCopyAttributeValue(element,attribute,&value);};
  if(pid==getpid()&&!NSThread.isMainThread)dispatch_sync(dispatch_get_main_queue(),read);else read();
  if(error!=kAXErrorSuccess){if(value)CFRelease(value);return nil;}return value?CFBridgingRelease(value):nil;
}
NSString *CUIdentity(pid_t pid) {
  struct proc_bsdinfo info={0};int count=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&info,sizeof(info));
  if(count!=sizeof(info))CUFail(@"APP_EXITED",@"The selected process no longer exists.");
  return [NSString stringWithFormat:@"%d:%llu:%llu",pid,info.pbi_start_tvsec,info.pbi_start_tvusec];
}
CGWindowID CUAXWindowId(AXUIElementRef element) {
  typedef AXError (*GetWindow)(AXUIElementRef,CGWindowID *);static GetWindow getWindow;static dispatch_once_t once;
  dispatch_once(&once,^{getWindow=(GetWindow)dlsym(RTLD_DEFAULT,"_AXUIElementGetWindow");});
  CGWindowID wid=0;if(getWindow)getWindow(element,&wid);return wid;
}
NSArray *CUWindows(NSNumber *pid) {
  NSArray *all=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionAll,kCGNullWindowID));NSMutableArray *out=[NSMutableArray new];
  NSMutableDictionary *applicationWindows=nil;
  if(pid&&AXIsProcessTrusted()){
    AXUIElementRef app=AXUIElementCreateApplication(pid.intValue);AXUIElementSetMessagingTimeout(app,.25);
    NSArray *windows=CUAX(app,kAXWindowsAttribute);
    id focused=CUAX(app,kAXFocusedWindowAttribute);CGWindowID focusedId=focused?CUAXWindowId((__bridge AXUIElementRef)focused):0;
    if([windows isKindOfClass:NSArray.class]){applicationWindows=[NSMutableDictionary new];for(id window in windows){AXUIElementRef ax=(__bridge AXUIElementRef)window;CGWindowID wid=CUAXWindowId(ax);if(wid)applicationWindows[@(wid)]=@{@"subrole":CUAX(ax,kAXSubroleAttribute)?:@"",@"modal":CUAX(ax,kAXModalAttribute)?:@NO,@"focused":@((BOOL)(wid==focusedId))};}}
    CFRelease(app);
  }
  for(NSDictionary *w in all) {
    NSNumber *owner=w[(id)kCGWindowOwnerPID];if(pid&&![owner isEqual:pid])continue;
    CGRect rect; if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)w[(id)kCGWindowBounds],&rect))continue;
    NSMutableDictionary *record=[@{@"pid":owner,@"window_id":w[(id)kCGWindowNumber],@"title":w[(id)kCGWindowName]?:@"",@"app_name":w[(id)kCGWindowOwnerName]?:@"",@"layer":w[(id)kCGWindowLayer]?:@0,@"is_on_screen":w[(id)kCGWindowIsOnscreen]?:@NO,@"bounds":@{@"x":@(rect.origin.x),@"y":@(rect.origin.y),@"width":@(rect.size.width),@"height":@(rect.size.height)}} mutableCopy];
    if(applicationWindows){NSDictionary *info=applicationWindows[w[(id)kCGWindowNumber]];record[@"is_application_window"]=@(info!=nil);if(info)[record addEntriesFromDictionary:info];}
    [out addObject:record];
  }return out;
}
NSArray *CUApps(void) {
  NSMutableDictionary *apps=[NSMutableDictionary new];
  for(NSRunningApplication *app in NSWorkspace.sharedWorkspace.runningApplications) {
    if(app.activationPolicy!=NSApplicationActivationPolicyRegular||!app.bundleIdentifier)continue;
    apps[app.bundleIdentifier]=@{@"bundle_id":app.bundleIdentifier,@"name":app.localizedName?:app.bundleIdentifier,@"pid":@(app.processIdentifier),@"running":@YES,@"active":@(app.active),@"launch_path":app.bundleURL.path?:@""};
  }
  for(NSString *directory in @[@"/Applications",@"/System/Applications",[NSHomeDirectory() stringByAppendingPathComponent:@"Applications"]]) {
    for(NSString *name in [NSFileManager.defaultManager contentsOfDirectoryAtPath:directory error:nil]) {
      if(![name.pathExtension isEqualToString:@"app"])continue;
      NSBundle *bundle=[NSBundle bundleWithPath:[directory stringByAppendingPathComponent:name]];NSString *identifier=bundle.bundleIdentifier;
      if(!identifier||apps[identifier])continue;
      apps[identifier]=@{@"bundle_id":identifier,@"name":[bundle objectForInfoDictionaryKey:@"CFBundleDisplayName"]?:[bundle objectForInfoDictionaryKey:@"CFBundleName"]?:name.stringByDeletingPathExtension,@"pid":@0,@"running":@NO,@"active":@NO,@"launch_path":bundle.bundlePath};
    }
  }return [[apps allValues] sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){return [a[@"name"] localizedCaseInsensitiveCompare:b[@"name"]];}];
}
CUWindow *CUResolveWindow(CUSession *session,NSDictionary *args) {
  [session check];NSNumber *pid=args[@"pid"],*wid=args[@"window_id"];
  if(![pid isKindOfClass:NSNumber.class]||![wid isKindOfClass:NSNumber.class]||pid.intValue<=0||wid.unsignedIntValue==0)CUFail(@"INVALID_TARGET",@"An exact pid and window_id are required.");
  NSString *identity=CUIdentity(pid.intValue);
  if(args[@"process_identity"]&&![args[@"process_identity"]isEqual:identity])CUFail(@"STALE_PROCESS",@"The application restarted; bind it again.");
  BOOL appContext=CUAXUsesAppContext(args);NSString *key=[NSString stringWithFormat:@"%@:%@%@",pid,wid,appContext?@":app":@""];
  CUWindow *target;@synchronized(session.windows){target=session.windows[key];}
  if(target&&![target.processIdentity isEqualToString:identity])CUFail(@"STALE_PROCESS",@"The application restarted; bind it again.");
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,wid.unsignedIntValue));
  NSDictionary *window=nil;for(NSDictionary *w in windows)if([w[(id)kCGWindowNumber]isEqual:wid]&&[w[(id)kCGWindowOwnerPID]isEqual:pid]){window=w;break;}
  if(!window)CUFail(@"STALE_WINDOW",@"The selected window closed or belongs to a different process.");
  if(!target){target=[CUWindow new];target.pid=pid.intValue;target.windowId=wid.unsignedIntValue;target.processIdentity=identity;@synchronized(session.windows){session.windows[key]=target;}}
  if(appContext){
    @synchronized(session.windows){
      NSMutableDictionary *captures=objc_getAssociatedObject(session,&CUAXSessionAppCapturesKey);
      if(!captures){captures=[NSMutableDictionary new];objc_setAssociatedObject(session,&CUAXSessionAppCapturesKey,captures,OBJC_ASSOCIATION_RETAIN_NONATOMIC);}
      NSString *appKey=[NSString stringWithFormat:@"%d:%@",pid.intValue,identity];id owner=captures[appKey];
      if(!owner){owner=[NSObject new];captures[appKey]=owner;}
      objc_setAssociatedObject(target,&CUAXAppCaptureOwnerKey,owner,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      NSDictionary *mapping=objc_getAssociatedObject(owner,&CUAXAppMappingKey);
      if(mapping)CURecordScreenshotMapping(target,[mapping[@"rect"]rectValue],[mapping[@"pointsPerPixel"]doubleValue]);
      target.sourceAXDiffingEnabled=objc_getAssociatedObject(owner,&CUAXAppDiffingKey);
    }
  }
  id diffing=args[@"is_ax_tree_diffing_enabled"];
  if(!target.sourceAXDiffingEnabled&&diffing&&CFGetTypeID((__bridge CFTypeRef)diffing)==CFBooleanGetTypeID())target.sourceAXDiffingEnabled=diffing;
  if(appContext&&target.sourceAXDiffingEnabled)objc_setAssociatedObject(CUAXCaptureOwner(target),&CUAXAppDiffingKey,target.sourceAXDiffingEnabled,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(target,&CUAXResolvedWindowInfoKey,window,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  CGRect bounds;if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],&bounds))CUFail(@"INVALID_WINDOW_BOUNDS",@"The selected window has no usable bounds.");target.bounds=bounds;
  if(target.bounds.size.width<=0||target.bounds.size.height<=0)CUFail(@"INVALID_WINDOW_BOUNDS",@"The selected window has no usable bounds.");
  return target;
}
static NSString *CUString(id value) {
  if(!value||[value isKindOfClass:NSNull.class])return @"";
  if([value isKindOfClass:NSString.class])return value;
  if([value isKindOfClass:NSNumber.class])return [value stringValue];
  return @"";
}
static NSString *CUAXDisplayValue(id value,NSString *type,AXUIElementRef element) {
  if([type isEqual:@"string"])return [value isKindOfClass:NSString.class]?value:nil;
  if([@[@"float",@"integer"]containsObject:type])return [value isKindOfClass:NSNumber.class]?[value stringValue]:nil;
  if([type isEqual:@"boolean"])return [value isKindOfClass:NSNumber.class]?(CFBooleanGetValue((__bridge CFBooleanRef)value)?@"on":@"off"):nil;
  if(![type isEqual:@"date"]||![value isKindOfClass:NSDate.class])return nil;
  id components=CUAXCaptured(element,CFSTR("AXDateTimeComponents"));NSInteger flags=[components isKindOfClass:NSNumber.class]?[components integerValue]:-1;
  NSDateFormatter *formatter=[NSDateFormatter new];
  if(flags==0xc||flags==0xe){formatter.dateStyle=NSDateFormatterNoStyle;formatter.timeStyle=NSDateFormatterShortStyle;}
  else if(flags==0xe0){formatter.dateStyle=NSDateFormatterShortStyle;formatter.timeStyle=NSDateFormatterNoStyle;}
  else if(flags==0xc0)formatter.dateFormat=@"MMMM yyyy";
  else{formatter.dateStyle=NSDateFormatterShortStyle;formatter.timeStyle=NSDateFormatterShortStyle;}
  return [formatter stringFromDate:value];
}
static id CUAXParameterized(AXUIElementRef element,CFStringRef name,id parameter) {
  CFTypeRef value=NULL;AXError error=AXUIElementCopyParameterizedAttributeValue(element,name,(__bridge CFTypeRef)parameter,&value);if(error!=kAXErrorSuccess){if(value)CFRelease(value);return nil;}return value?CFBridgingRelease(value):nil;
}
static NSData *CUAXStringUnits(NSString *string) {
  if(string.length>NSUIntegerMax/sizeof(unichar))CUFail(@"TEXT_LENGTH_OVERFLOW",@"Accessibility text is too long.");NSMutableData *units=[NSMutableData dataWithLength:string.length*sizeof(unichar)];if(string.length)[string getCharacters:units.mutableBytes range:NSMakeRange(0,string.length)];return units;
}
static NSUInteger CUAXCharacterCount(NSString *string) { NSData *units=CUAXStringUnits(string);return (NSUInteger)CUObservationCharacterCount(units.bytes,string.length); }
static NSUInteger CUAXPrefixUTF16Length(NSString *string,NSInteger count) { NSData *units=CUAXStringUnits(string);return (NSUInteger)CUObservationPrefixUTF16Length(units.bytes,string.length,count); }
static BOOL CUAXCharacterIsLF(NSString *string,BOOL last) { NSData *units=CUAXStringUnits(string);return CUObservationCharacterIsLF(units.bytes,string.length,last)!=0; }
static BOOL CUAXStringsEqual(NSString *left,NSString *right) { NSData *a=CUAXStringUnits(left),*b=CUAXStringUnits(right);return CUObservationStringsEqual(a.bytes,left.length,b.bytes,right.length)!=0; }
static NSString *CUAXStringSlice(AXUIElementRef element,NSString *string,NSRange range) {
  if(range.location>NSUIntegerMax-range.length)return @"";
  if(CUAXCharacterCount(string)<NSMaxRange(range)){
    CFRange source={range.location==NSNotFound?-1:(CFIndex)range.location,(CFIndex)range.length};AXValueRef encoded=AXValueCreate(kAXValueCFRangeType,&source);
    id value=encoded?CUAXParameterized(element,kAXStringForRangeParameterizedAttribute,(__bridge id)encoded):nil;if(encoded)CFRelease(encoded);return [value isKindOfClass:NSString.class]?value:@"";
  }
  if(NSMaxRange(range)>string.length)return @"";
  for(NSNumber *boundary in @[@(range.location),@(NSMaxRange(range))]){NSUInteger index=boundary.unsignedIntegerValue;if(index&&index<string.length&&CFStringIsSurrogateHighCharacter([string characterAtIndex:index-1])&&CFStringIsSurrogateLowCharacter([string characterAtIndex:index]))return @"";}
  return [string substringWithRange:range];
}
static NSString *CUAXNormalizeString(AXUIElementRef element,NSString *string,BOOL textual,CUAXPartialValue *partial,NSValue **truncation) {
  if(!textual)return string;
  NSUInteger count=MAX(CUAXCharacterCount(string),partial.textCount.unsignedIntegerValue);
  if(count<=100000){
    if(partial.textRange&&partial.textRange.rangeValue.length<partial.textCount.unsignedIntegerValue){id complete=CUAX(element,kAXValueAttribute);if([complete isKindOfClass:NSString.class])return complete;*truncation=partial.textRange;}
    return string;
  }
  CFRange visible={0};id value=CUAX(element,kAXVisibleCharacterRangeAttribute);BOOL available=value&&CFGetTypeID((__bridge CFTypeRef)value)==AXValueGetTypeID()&&AXValueGetValue((__bridge AXValueRef)value,kAXValueCFRangeType,&visible)&&visible.location>=0&&visible.length>0;
  NSRange range=available?NSMakeRange((NSUInteger)visible.location,(NSUInteger)visible.length):NSMakeRange(0,100000);*truncation=[NSValue valueWithRange:range];return CUAXStringSlice(element,string,range);
}
@interface CUAXMappedString : NSObject
@property(strong) NSMutableString *string;
@property(strong) NSMutableArray *offsets;
- (instancetype)initWithString:(NSString *)string sourceOffset:(NSUInteger)offset;
- (void)append:(CUAXMappedString *)other;
- (void)appendGenerated:(NSString *)string;
- (void)removeRange:(NSRange)range;
- (void)prependGenerated:(NSString *)string;
- (void)trimWhitespace;
@end
@implementation CUAXMappedString
- (instancetype)initWithString:(NSString *)string sourceOffset:(NSUInteger)offset { if((self=[super init])){_string=[string?:@"" mutableCopy];_offsets=[NSMutableArray new];for(NSUInteger i=0;i<_string.length;i++)[_offsets addObject:offset==NSNotFound?NSNull.null:@(offset+i)];}return self; }
- (void)append:(CUAXMappedString *)other { [self.string appendString:other.string];[self.offsets addObjectsFromArray:other.offsets]; }
- (void)appendGenerated:(NSString *)string { [self append:[[CUAXMappedString alloc]initWithString:string sourceOffset:NSNotFound]]; }
- (void)removeRange:(NSRange)range { [self.string deleteCharactersInRange:range];[self.offsets removeObjectsInRange:range]; }
- (void)prependGenerated:(NSString *)string { CUAXMappedString *prefix=[[CUAXMappedString alloc]initWithString:string sourceOffset:NSNotFound];[prefix append:self];self.string=prefix.string;self.offsets=prefix.offsets; }
- (void)trimWhitespace { NSCharacterSet *set=NSCharacterSet.whitespaceAndNewlineCharacterSet;NSUInteger start=0,end=self.string.length;while(start<end&&[set characterIsMember:[self.string characterAtIndex:start]])start++;while(end>start&&[set characterIsMember:[self.string characterAtIndex:end-1]])end--;[self removeRange:NSMakeRange(end,self.string.length-end)];[self removeRange:NSMakeRange(0,start)]; }
@end
static NSDictionary *CUAXInlineStyle(NSUInteger format) { return @{@"kind":@3,@"format":@(format)}; }
static BOOL CUAXFirstCharacterIsNumber(NSString *string) {
  if(!string.length)return NO;NSData *units=CUAXStringUnits(string);return CUObservationFirstCharacterIsNumber(units.bytes,string.length)!=0;
}
static NSArray *CUAXRichStyles(NSDictionary *attributes) {
  NSMutableOrderedSet *styles=[NSMutableOrderedSet new];id font=attributes[NSAccessibilityFontTextAttribute];
  if([font isKindOfClass:NSDictionary.class]){
    id name=font[@"AXFontName"],size=font[@"AXFontSize"],family=font[@"AXFontFamily"];
    if([name isKindOfClass:NSString.class]&&[size isKindOfClass:NSNumber.class]){NSMutableDictionary *values=[@{NSFontNameAttribute:name}mutableCopy];if([family isKindOfClass:NSString.class])values[NSFontFamilyAttribute]=family;NSFont *native=[NSFont fontWithDescriptor:[NSFontDescriptor fontDescriptorWithFontAttributes:values] size:[size doubleValue]];if(native){CTFontSymbolicTraits traits=CTFontGetSymbolicTraits((__bridge CTFontRef)native);if(traits&kCTFontBoldTrait)[styles addObject:CUAXInlineStyle(2)];if(traits&kCTFontItalicTrait)[styles addObject:CUAXInlineStyle(3)];}}
    if([font[@"AXFontBold"]isKindOfClass:NSNumber.class]&&[font[@"AXFontBold"]boolValue])[styles addObject:CUAXInlineStyle(2)];
  }
  id underline=attributes[NSAccessibilityUnderlineTextAttribute],strike=attributes[NSAccessibilityStrikethroughTextAttribute],superscript=attributes[NSAccessibilitySuperscriptTextAttribute];
  if([underline isKindOfClass:NSNumber.class]&&[underline integerValue]>0)[styles addObject:CUAXInlineStyle(4)];
  if([strike isKindOfClass:NSNumber.class]&&[strike boolValue])[styles addObject:CUAXInlineStyle(5)];
  if([superscript isKindOfClass:NSNumber.class]&&[superscript integerValue])[styles addObject:CUAXInlineStyle([superscript integerValue]>0?6:7)];
  id quote=attributes[@"AXBlockQuoteLevel"];if([quote isKindOfClass:NSNumber.class]&&[quote integerValue]>0)[styles addObject:@{@"kind":@1,@"level":@([quote integerValue])}];
  id styleName=attributes[@"AXStyleName"];if([styleName isKindOfClass:NSString.class])for(NSString *name in [styleName componentsSeparatedByString:@", "]){NSUInteger level=[@[@"Title",@"Heading",@"Subheading"]indexOfObject:name];if(level!=NSNotFound)[styles addObject:@{@"kind":@0,@"level":@(level+1)}];else if([name isEqual:@"Fixed width"])[styles addObject:CUAXInlineStyle(0)];else if([name isEqual:@"Collapsed"])[styles addObject:CUAXInlineStyle(1)];}
  id level=attributes[NSAccessibilityListItemLevelTextAttribute],index=attributes[NSAccessibilityListItemIndexTextAttribute],prefix=attributes[NSAccessibilityListItemPrefixTextAttribute];
  if([level isKindOfClass:NSNumber.class]&&[index isKindOfClass:NSNumber.class]&&[prefix isKindOfClass:NSAttributedString.class]){NSString *text=[prefix string],*marker=@"*";if([text isEqual:@"checklist item, incomplete"])marker=@"* [ ]";else if([text isEqual:@"checklist item, completed"])marker=@"* [x]";else if(CUAXFirstCharacterIsNumber(text))marker=[[index stringValue]stringByAppendingString:@"."];[styles addObject:@{@"kind":@2,@"level":@([level integerValue]),@"index":@([index integerValue]),@"marker":marker}];}
  return styles.array;
}
static NSString *CUAXStyleDelimiters(NSArray *styles,BOOL opening) {
  NSMutableString *text=[NSMutableString new];NSArray *opens=@[@"```\n",@"<details><summary>\n",@"**",@"*",@"<u>",@"~~",@"<sup>",@"<sub>"];
  NSArray *closes=@[@"\n```",@"\n</summary>(collapsed content is hidden)</details>",@"**",@"*",@"</u>",@"~~",@"</sup>",@"</sub>"];
  for(NSDictionary *style in styles){NSUInteger kind=[style[@"kind"]unsignedIntegerValue];if(kind==3){NSUInteger format=[style[@"format"]unsignedIntegerValue];[text appendString:(opening?opens:closes)[format]];}
    else if(opening){NSInteger level=[style[@"level"]integerValue];if(level<0||level>NSIntegerMax/4)CUFail(@"INVALID_TEXT_STYLE",@"Accessibility text contains an invalid indentation level.");NSString *prefix=kind==2?[[[@""stringByPaddingToLength:(NSUInteger)level*4 withString:@" " startingAtIndex:0]stringByAppendingString:style[@"marker"]]stringByAppendingString:@" "]:[[@""stringByPaddingToLength:(NSUInteger)level withString:kind==0?@"#":@">" startingAtIndex:0]stringByAppendingString:@" "];[text insertString:prefix atIndex:0];}
  }return text;
}
static NSArray *CUAXStyleDifference(NSArray *styles,NSArray *other) { NSMutableArray *result=[NSMutableArray new];for(id style in styles)if(![other containsObject:style])[result addObject:style];return result; }
static CUAXMappedString *CUAXRichRun(NSAttributedString *attributed,NSRange range,NSDictionary *attributes,CUAXURLContext *context) {
  CUAXMappedString *run=[[CUAXMappedString alloc]initWithString:[attributed.string substringWithRange:range] sourceOffset:range.location];id link=attributes[NSAccessibilityLinkTextAttribute];
  if(link&&CFGetTypeID((__bridge CFTypeRef)link)==AXUIElementGetTypeID()){AXUIElementRef element=(__bridge AXUIElementRef)link;id value=CUAXCaptured(element,kAXURLAttribute);NSURL *url=[value isKindOfClass:NSURL.class]?value:([value isKindOfClass:NSString.class]?[NSURL URLWithString:value]:nil);BOOL image=[CUAXCaptured(element,kAXRoleAttribute)isEqual:@"AXImage"];NSString *text=[context trim:url isImage:image];if(text){[run trimWhitespace];[run prependGenerated:@"["];[run appendGenerated:[NSString stringWithFormat:@"](%@)",text]];}}
  id attachment=attributes[NSAccessibilityAttachmentTextAttribute];if(attachment&&CFGetTypeID((__bridge CFTypeRef)attachment)==AXUIElementGetTypeID()){
    AXUIElementRef element=(__bridge AXUIElementRef)attachment;BOOL separate=[run.string rangeOfCharacterFromSet:NSCharacterSet.newlineCharacterSet].location!=NSNotFound;BOOL marker=run.string.length==1&&[run.string characterAtIndex:0]==0xfffc;
    if([CUAXCaptured(element,kAXRoleAttribute)isEqual:@"AXImage"]){id value=CUAXCaptured(element,kAXURLAttribute);NSURL *url=[value isKindOfClass:NSURL.class]?value:([value isKindOfClass:NSString.class]?[NSURL URLWithString:value]:nil);[context trim:url isImage:YES];}
    NSString *description=(!run.string.length||marker||separate)?CUAXCaptured(element,kAXDescriptionAttribute):[run.string copy];if(![description isKindOfClass:NSString.class])description=nil;
    NSString *role=CUAXCaptured(element,kAXRoleDescriptionAttribute);if(![role isKindOfClass:NSString.class])role=@"attachment";
    CUAXMappedString *replacement=[[CUAXMappedString alloc]initWithString:description.length?[NSString stringWithFormat:@"[%@: %@]",role,description]:[NSString stringWithFormat:@"[%@]",role] sourceOffset:NSNotFound];if(separate){[replacement appendGenerated:@" "];[replacement append:run];}run=replacement;
  }
  return run;
}
static void CUAXAppendRichRun(CUAXMappedString *output,CUAXMappedString *run,NSArray *styles,NSArray **active) {
  NSArray *old=*active,*removed=CUAXStyleDifference(old,styles),*added=CUAXStyleDifference(styles,old);BOOL block=NO;
  for(NSDictionary *style in styles)if([style[@"kind"]integerValue]<3||[style[@"format"]integerValue]<2){block=YES;break;}
  if(CUAXCharacterIsLF(output.string,YES)){[output removeRange:NSMakeRange(output.string.length-1,1)];[run prependGenerated:@"\n"];}
  BOOL leading=CUAXCharacterIsLF(run.string,NO)&&CUAXCharacterCount(run.string)>1;if(leading)[run removeRange:NSMakeRange(0,1)];
  if(block){BOOL trailing=CUAXCharacterIsLF(run.string,YES);if(trailing)[run removeRange:NSMakeRange(run.string.length-1,1)];NSString *prefix=[NSString stringWithFormat:@"%@\n%@",CUAXStyleDelimiters(styles,NO),CUAXStyleDelimiters(styles,YES)];CUAXMappedString *mapped=[[CUAXMappedString alloc]initWithString:@"" sourceOffset:NSNotFound];
    [run.string enumerateSubstringsInRange:NSMakeRange(0,run.string.length) options:NSStringEnumerationByComposedCharacterSequences usingBlock:^(NSString *substring,NSRange range,NSRange enclosing,BOOL *stop){if([substring isEqual:@"\n"])[mapped appendGenerated:prefix];else{[mapped.string appendString:substring];[mapped.offsets addObjectsFromArray:[run.offsets subarrayWithRange:range]];}}];if(trailing)[mapped appendGenerated:@"\n"];run=mapped;
    if(leading){[run prependGenerated:[NSString stringWithFormat:@"%@\n%@",CUAXStyleDelimiters(old,NO),CUAXStyleDelimiters(styles,YES)]];[output append:run];*active=styles;return;}
  }
  NSString *prefix=[NSString stringWithFormat:@"%@%@%@",CUAXStyleDelimiters(removed,NO),leading?@"\n":@"",CUAXStyleDelimiters(added,YES)];if(leading)[run prependGenerated:prefix];else[output appendGenerated:prefix];[output append:run];*active=styles;
}
static NSAttributedString *CUAXAttributedString(CUAXNode *node) {
  id value=nil;NSRange range=node.truncationRange?node.truncationRange.rangeValue:NSMakeRange(0,CUAXStringAttribute(node,@"value").length);
  if(!node.truncationRange){CFArrayRef names=NULL;AXError error=AXUIElementCopyParameterizedAttributeNames(node.element.ax,&names);NSArray *supported=names?CFBridgingRelease(names):@[];if(error==kAXErrorSuccess&&[supported containsObject:@"AXAttributedStringForTextMarkerRangeWithOptions"]){id marker=CUAXParameterized(node.element.ax,CFSTR("AXTextMarkerRangeForUIElement"),(__bridge id)node.element.ax);if(!marker)return nil;value=CUAXParameterized(node.element.ax,CFSTR("AXAttributedStringForTextMarkerRangeWithOptions"),@{@"AXTextMarkerRange":marker,@"AXSpellCheck":@NO});return [value isKindOfClass:NSAttributedString.class]?value:nil;}}
  CFRange source={range.location==NSNotFound?-1:(CFIndex)range.location,(CFIndex)range.length};AXValueRef parameter=AXValueCreate(kAXValueCFRangeType,&source);value=parameter?CUAXParameterized(node.element.ax,kAXAttributedStringForRangeParameterizedAttribute,(__bridge id)parameter):nil;if(parameter)CFRelease(parameter);return [value isKindOfClass:NSAttributedString.class]?value:nil;
}
static void CUAXAssignAttributedValue(CUAXNode *node,NSAttributedString *attributed) {
  CUAXMappedString *output=[[CUAXMappedString alloc]initWithString:@"" sourceOffset:NSNotFound];__block NSArray *active=@[];
  [attributed enumerateAttributesInRange:NSMakeRange(0,attributed.length) options:0 usingBlock:^(NSDictionary *attributes,NSRange range,BOOL *stop){CUAXAppendRichRun(output,CUAXRichRun(attributed,range,attributes,node.urlContext),CUAXRichStyles(attributes),&active);}];
  CUAXAppendRichRun(output,[[CUAXMappedString alloc]initWithString:@"" sourceOffset:attributed.length],@[],&active);CUAXSetAttribute(node,@"value",output.string);node.attributedValue=attributed;node.valueSourceOffsets=[output.offsets copy];
}
static void CUAXApplyAttributedText(CUAXNode *node) {
  if(![node.row[@"role"]isEqual:@"AXTextArea"]||!CUAXStringAttribute(node,@"value")||[CUAXCaptured(node.element.ax,CFSTR("AXTextualContent"))isEqual:@"AXTextualContextSourceCode"])return;NSAttributedString *attributed=CUAXAttributedString(node);if(attributed)CUAXAssignAttributedValue(node,attributed);
}
static void CUAXApplyWebAreaAttributedText(CUAXNode *node) {
  if(node.contextType!=2||![node.row[@"role"]isEqual:@"AXWebArea"]||[node.supportedAttributes containsObject:@"ChromeAXNodeId"])return;
  typedef CFTypeID (*MarkerType)(void);typedef CFTypeRef (*MarkerRangeCreate)(CFAllocatorRef,CFTypeRef,CFTypeRef);static MarkerType markerType;static MarkerRangeCreate create;static dispatch_once_t once;dispatch_once(&once,^{markerType=(MarkerType)dlsym(RTLD_DEFAULT,"AXTextMarkerGetTypeID");create=(MarkerRangeCreate)dlsym(RTLD_DEFAULT,"AXTextMarkerRangeCreate");});
  if(!markerType||!create)CUFail(@"ACCESSIBILITY_SPI_UNAVAILABLE",@"The native accessibility text-marker API is unavailable.");id start=CUAXCaptured(node.element.ax,CFSTR("AXStartTextMarker")),end=CUAXCaptured(node.element.ax,CFSTR("AXEndTextMarker"));if(!start||!end||CFGetTypeID((__bridge CFTypeRef)start)!=markerType()||CFGetTypeID((__bridge CFTypeRef)end)!=markerType())return;
  id next=CUAXParameterized(node.element.ax,CFSTR("AXNextLineEndTextMarkerForTextMarker"),end);if(next&&CFGetTypeID((__bridge CFTypeRef)next)==markerType())return;CFTypeRef markerRange=create(NULL,(__bridge CFTypeRef)start,(__bridge CFTypeRef)end);if(!markerRange)return;
  id value=nil;@try{CFArrayRef names=NULL;AXUIElementCopyParameterizedAttributeNames(node.element.ax,&names);NSArray *supported=names?CFBridgingRelease(names):@[];BOOL options=[supported containsObject:@"AXAttributedStringForTextMarkerRangeWithOptions"];value=CUAXParameterized(node.element.ax,options?CFSTR("AXAttributedStringForTextMarkerRangeWithOptions"):CFSTR("AXAttributedStringForTextMarkerRange"),options?@{@"AXTextMarkerRange":(__bridge id)markerRange,@"AXSpellCheck":@NO}:(__bridge id)markerRange);}@finally{CFRelease(markerRange);}
  if(![value isKindOfClass:NSAttributedString.class])return;CUAXAssignAttributedValue(node,value);[node.children removeAllObjects];
}
static void CUCaptureWait(CUSession *session,dispatch_semaphore_t semaphore) {
  if(NSThread.isMainThread)CUFail(@"CAPTURE_QUEUE",@"Native screenshot requests must wait outside the AppKit thread.");
  for(int i=0;i<80;i++){[session check];if(dispatch_semaphore_wait(semaphore,dispatch_time(DISPATCH_TIME_NOW,50*NSEC_PER_MSEC))==0)return;}
  CUFail(@"CAPTURE_TIMEOUT",@"ScreenCaptureKit did not return a window frame in time.");
}
static NSDictionary *CUCaptureResult(CUSession *session,CUWindow *target,NSDictionary *args) {
  CGImageDestinationRef destination=NULL;
  @try {
    if(!CGPreflightScreenCaptureAccess())CUFail(@"SCREEN_RECORDING_PERMISSION",@"Enable Screen Recording for Oh My DSH Computer Use in macOS Settings.");
    BOOL preserveMapping=CUWindowRegistryHasFocusedMenuBarItem(target);
    CGRect contextBounds=preserveMapping?target.sourceVisibleRect:target.bounds;double pointsPerPixel=target.sourcePointsPerPixel;NSValue *imageSize=nil;
    if(!preserveMapping){
      CGSize requested=CUWindowScreenshotSizeForContext(contextBounds,CUWindowScreenshotContextScale(contextBounds),
        [args[@"should_use_legacy_screenshot_sizing"]boolValue],!args[@"should_normalize_screenshot_to_point_resolution"]||[args[@"should_normalize_screenshot_to_point_resolution"]boolValue],&pointsPerPixel);
      double maximum=[args[@"max_dimension"]doubleValue];
      if(maximum>0&&MAX(requested.width,requested.height)>maximum){double factor=maximum/MAX(requested.width,requested.height);requested.width*=factor;requested.height*=factor;pointsPerPixel/=factor;}
      imageSize=[NSValue valueWithSize:requested];
    }
    NSDictionary *cursor=CUCursorCaptureSource(target.pid,target.windowId,session.label);
    NSArray *additional=cursor?@[cursor[@"cursorWindowID"]]:@[];
    __block CUWindowScreenshotResult *captured;__block NSError *failure;dispatch_semaphore_t ready=dispatch_semaphore_create(0);
    CUWindowScreenshotCapture(target.windowId,additional,imageSize,YES,NO,^(CUWindowScreenshotResult *result,NSError *error){captured=result;failure=error;dispatch_semaphore_signal(ready);});
    CUCaptureWait(session,ready);[session check];
    if(failure){
      NSString *code=@"CAPTURE_UNAVAILABLE";
      if([failure.domain isEqual:CUWindowScreenshotErrorDomain]){if(failure.code==CUWindowScreenshotInvalidPixelSize)code=@"CAPTURE_INVALID_SIZE";else if(failure.code==CUWindowScreenshotSourceCallbackInvariant)code=@"CAPTURE_CALLBACK_INVARIANT";}
      CUFail(code,failure.localizedDescription);
    }
    if(!captured.image)CUFail(@"CAPTURE_UNAVAILABLE",@"The requested window did not produce an image.");
    if(cursor&&!CUCursorCaptureSourceIsCurrent(cursor))CUFail(@"CAPTURE_UNAVAILABLE",@"The captured software cursor owner changed.");
    CGImageRef image=captured.image;
    BOOL jpeg=!args[@"should_use_jpeg"]||[args[@"should_use_jpeg"]boolValue];NSNumber *quality=args[@"jpeg_quality"]?:@.8;NSDictionary *options=jpeg&&[quality isKindOfClass:NSNumber.class]&&quality.doubleValue>0&&quality.doubleValue<=1?@{(__bridge id)kCGImageDestinationLossyCompressionQuality:quality}:nil;
    NSMutableData *data=[NSMutableData new];destination=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data,jpeg?CFSTR("public.jpeg"):CFSTR("public.png"),1,NULL);
    if(!destination)CUFail(@"CAPTURE_ENCODING_FAILED",@"Could not encode the captured window.");
    CGImageDestinationAddImage(destination,image,(__bridge CFDictionaryRef)options);
    if(!CGImageDestinationFinalize(destination))CUFail(@"CAPTURE_ENCODING_FAILED",@"Could not encode the captured window.");
    [session check];
    return @{@"width":@(CGImageGetWidth(image)),@"height":@(CGImageGetHeight(image)),@"mimeType":jpeg?@"image/jpeg":@"image/png",@"data":[data base64EncodedStringWithOptions:0],
      @"sourceVisibleRect":[NSValue valueWithRect:contextBounds],@"sourcePointsPerPixel":@(pointsPerPixel)};
  } @finally {
    if(destination)CFRelease(destination);
  }
}
static BOOL CUAXWebShapedApplication(pid_t pid) {
  NSURL *url=[NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleURL;NSBundle *bundle=url?[NSBundle bundleWithURL:url]:nil;NSString *principal=[bundle objectForInfoDictionaryKey:@"NSPrincipalClass"];
  BOOL web=[principal isEqual:@"AtomApplication"]||[principal isEqual:@"BrowserCrApplication"];
  id types=[bundle objectForInfoDictionaryKey:@"CFBundleURLTypes"];
  if([types isKindOfClass:NSArray.class])for(id type in types)if([type isKindOfClass:NSDictionary.class]&&[type[@"CFBundleURLSchemes"]isKindOfClass:NSArray.class]&&[type[@"CFBundleURLSchemes"]containsObject:@"http"])web=YES;
  return web;
}
static BOOL CUAXChromiumWindow(pid_t pid,AXUIElementRef window) {
  if(!CUAXWebShapedApplication(pid))return NO;id children=CUAX(window,kAXChildrenAttribute);if(![children isKindOfClass:NSArray.class]||![children count])return NO;id first=[children firstObject];if(CFGetTypeID((__bridge CFTypeRef)first)!=AXUIElementGetTypeID())return NO;
  CFArrayRef names=NULL;AXError error=AXUIElementCopyAttributeNames((__bridge AXUIElementRef)first,&names);NSArray *supported=names?CFBridgingRelease(names):@[];return error==kAXErrorSuccess&&[supported containsObject:@"ChromeAXNodeId"];
}
static BOOL CUAXChromiumValueRole(NSString *role,NSString *subrole,NSString *parentRole) {
  if([role isEqual:@"AXIncrementor"]&&[@[@"AXDateField",@"AXDateTimeArea",@"AXTimeField"]containsObject:parentRole])return NO;
  if([@[@"AXComboBox",@"AXIncrementor",@"AXTextArea",@"AXTextField"]containsObject:role])return YES;
  return [role isEqual:@"AXRadioButton"]&&[subrole isEqual:@"AXTabButton"];
}
@interface CUAXEnablementCoordinator : NSObject
@property(strong) NSRecursiveLock *lock;
@property(strong) NSMapTable<NSRunningApplication *,NSMutableDictionary<NSNumber *,NSNumber *> *> *counts;
@property(strong) NSMutableSet<NSRunningApplication *> *initialized;
+ (instancetype)shared;
- (BOOL)begin:(NSRunningApplication *)app mode:(NSNumber *)mode;
- (BOOL)end:(NSRunningApplication *)app mode:(NSNumber *)mode;
@end
@implementation CUAXEnablementCoordinator
+ (instancetype)shared { static CUAXEnablementCoordinator *instance;static dispatch_once_t once;dispatch_once(&once,^{instance=[CUAXEnablementCoordinator new];instance.lock=[NSRecursiveLock new];instance.counts=[NSMapTable strongToStrongObjectsMapTable];instance.initialized=[NSMutableSet new];});return instance; }
- (BOOL)begin:(NSRunningApplication *)app mode:(NSNumber *)mode { NSMutableDictionary *modes=[self.counts objectForKey:app];if(!modes){modes=[NSMutableDictionary new];[self.counts setObject:modes forKey:app];}NSUInteger count=[modes[mode]unsignedIntegerValue];if(count==NSUIntegerMax)CUFail(@"AX_ENABLEMENT_OVERFLOW",@"Accessibility enablement assertions are exhausted.");modes[mode]=@(count+1);return count==0; }
- (BOOL)end:(NSRunningApplication *)app mode:(NSNumber *)mode { NSMutableDictionary *modes=[self.counts objectForKey:app];NSUInteger count=[modes[mode]unsignedIntegerValue];if(!count)return NO;if(count>1){modes[mode]=@(count-1);return NO;}[modes removeObjectForKey:mode];if(!modes.count)[self.counts removeObjectForKey:app];return YES; }
@end
@interface CUAXEnablementAssertion : NSObject
@property(strong) NSRunningApplication *application;
@property(strong) CUElement *appElement;
@property(strong) NSArray<NSNumber *> *modes;
@property BOOL enabled;
- (void)disable;
@end
static NSString *const CUAXVoiceOverKey=@"voiceOverOnOffKey";
static NSString *const CUAXVoiceOverNotification=@"com.apple.universalaccess.VoiceOverSettingsDidChange";
static void CUAXPostVoiceOverChange(void) { [[[NSDistributedNotificationCenter alloc]init]postNotificationName:CUAXVoiceOverNotification object:nil]; }
@implementation CUAXEnablementAssertion
- (void)disable {
  CUAXEnablementCoordinator *coordinator=CUAXEnablementCoordinator.shared;[coordinator.lock lock];
  @try { if(!self.enabled)return;self.enabled=NO;NSArray *heldModes=self.modes;self.modes=@[];
    for(NSNumber *mode in heldModes)if([coordinator end:self.application mode:mode]){
    if(mode.unsignedIntegerValue<2)AXUIElementSetAttributeValue(self.appElement.ax,mode.unsignedIntegerValue?CFSTR("AXEnhancedUserInterface"):CFSTR("AXManualAccessibility"),kCFBooleanFalse);
    else if(![NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.VoiceOver"].count){NSUserDefaults *defaults=[[NSUserDefaults alloc]initWithSuiteName:@"com.apple.universalaccess"];if(defaults){[defaults setBool:NO forKey:CUAXVoiceOverKey];CUAXPostVoiceOverChange();}}
  }}@finally{[coordinator.lock unlock];}
}
@end
static AXError CUAXEnablementCall(AXUIElementRef app,AXError (^operation)(void)) {
  pid_t pid=0;AXError error=AXUIElementGetPid(app,&pid);if(error!=kAXErrorSuccess)return error;
  __block AXError result=kAXErrorFailure;void (^work)(void)=^{result=operation();};
  if(pid==getpid()&&!NSThread.isMainThread)dispatch_sync(dispatch_get_main_queue(),work);else work();return result;
}
static BOOL CUAXOptionalEnablementUnavailable(AXError error) {
  return error==kAXErrorAttributeUnsupported||error==kAXErrorNotImplemented||error==kAXErrorNoValue;
}
static void CUAXCheckEnablementError(AXError error) {
  if(error==kAXErrorSuccess)return;
  if(error==kAXErrorAPIDisabled||!AXIsProcessTrusted())CUFail(@"ACCESSIBILITY_PERMISSION",@"Enable Accessibility for Oh My DSH Computer Use in macOS Settings.");
  if(error==kAXErrorInvalidUIElement)CUFail(@"STALE_ELEMENT",@"The application's accessibility element is no longer valid.");
  CUFail(@"ACCESSIBILITY_ENABLEMENT",[NSString stringWithFormat:@"The application could not complete accessibility enablement (AXError %d).",(int)error]);
}
static NSNumber *CUAXWritableAccessibilityState(AXUIElementRef app,CFStringRef attribute) {
  if(!AXIsProcessTrusted())CUFail(@"ACCESSIBILITY_PERMISSION",@"Enable Accessibility for Oh My DSH Computer Use in macOS Settings.");
  __block Boolean settable=false;AXError error=CUAXEnablementCall(app,^AXError(void){return AXUIElementIsAttributeSettable(app,attribute,&settable);});
  if(CUAXOptionalEnablementUnavailable(error))return nil;CUAXCheckEnablementError(error);if(!settable)return nil;
  __block CFTypeRef raw=NULL;error=CUAXEnablementCall(app,^AXError(void){return AXUIElementCopyAttributeValue(app,attribute,&raw);});
  id value=raw?CFBridgingRelease(raw):nil;
  if(CUAXOptionalEnablementUnavailable(error))return nil;CUAXCheckEnablementError(error);
  return [value isKindOfClass:NSNumber.class]?value:nil;
}
static BOOL CUAXChangeAccessibilityAttribute(AXUIElementRef app,CFStringRef attribute) {
  NSNumber *value=CUAXWritableAccessibilityState(app,attribute);if(!value||value.boolValue)return NO;
  AXError error=CUAXEnablementCall(app,^AXError(void){return AXUIElementSetAttributeValue(app,attribute,kCFBooleanTrue);});
  if(CUAXOptionalEnablementUnavailable(error))return NO;CUAXCheckEnablementError(error);return YES;
}
static BOOL CUAXWindowNeedsSettling(AXUIElementRef window) {
  if(!window)return NO;CFArrayRef result=NULL;AXError error=AXUIElementCopyAttributeValues(window,kAXChildrenAttribute,0,1,&result);NSArray *children=result?CFBridgingRelease(result):nil;
  if(error!=kAXErrorSuccess||!children.count||CFGetTypeID((__bridge CFTypeRef)children[0])!=AXUIElementGetTypeID())return NO;
  CFArrayRef names=NULL;error=AXUIElementCopyAttributeNames((__bridge AXUIElementRef)children[0],&names);NSArray *attributes=names?CFBridgingRelease(names):nil;return error==kAXErrorSuccess&&[attributes containsObject:@"ChromeAXNodeId"];
}
static BOOL CUAXWindowHasWebArea(CUSession *session,AXUIElementRef window) {
  id initial=CUAX(window,kAXChildrenAttribute);NSMutableArray *queue=[([initial isKindOfClass:NSArray.class]?initial:@[])mutableCopy];
  for(NSUInteger index=0;index<queue.count;index++){[session check];id value=queue[index];if(CFGetTypeID((__bridge CFTypeRef)value)!=AXUIElementGetTypeID())continue;AXUIElementRef element=(__bridge AXUIElementRef)value;
    if([CUAX(element,kAXRoleAttribute)isEqual:@"AXWebArea"])return YES;id children=CUAX(element,kAXChildrenAttribute);if([children isKindOfClass:NSArray.class])[queue addObjectsFromArray:children];
  }return NO;
}
static BOOL CUAXSettleAccessibility(CUSession *session,AXUIElementRef window) {
  if(!window)return NO;[session check];usleep(100000);NSDate *start=[NSDate date];
  while([[NSDate date]timeIntervalSinceDate:start]<=1){if(CUAXWindowHasWebArea(session,window))return YES;[session check];[NSThread sleepForTimeInterval:.05];}return NO;
}
static CUAXEnablementAssertion *CUAXEnableAccessibility(CUSession *session,CUWindow *target,AXUIElementRef axApp,AXUIElementRef window,NSUInteger context) {
  [session check];NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:target.pid];if(!app||app.terminated)CUFail(@"APP_EXITED",@"The selected application no longer exists.");
  NSString *bundle=app.bundleIdentifier?:@"";__block CFArrayRef names=NULL;AXError namesError=CUAXEnablementCall(axApp,^AXError(void){return AXUIElementCopyAttributeNames(axApp,&names);});NSArray *supported=names?CFBridgingRelease(names):@[];CUAXCheckEnablementError(namesError);
  CUAXEnablementCoordinator *coordinator=CUAXEnablementCoordinator.shared;NSMutableArray<NSNumber *> *modes=[NSMutableArray new];BOOL changed=NO;
  CUAXEnablementAssertion *assertion=[CUAXEnablementAssertion new];assertion.application=app;assertion.appElement=[[CUElement alloc]initWithElement:axApp];assertion.enabled=YES;assertion.modes=modes;
  @try {
    NSNumber *ordinary=nil;if(context==0&&[supported containsObject:@"AXManualAccessibility"])ordinary=@0;
    else if(context==0||[bundle hasPrefix:@"com.apple.iWork"]||[bundle isEqual:@"com.spotify.client"])ordinary=@1;
    // Only acquired counts belong to this assertion; rollback also removes its mode.
    if(ordinary){[coordinator.lock lock];@try{BOOL first=[coordinator begin:app mode:ordinary];[modes addObject:ordinary];if(first){
      __block BOOL enabled=NO;void (^enable)(void)=^{if([bundle isEqual:@"com.spotify.client"]&&!app.active){NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:1];while(!app.active&&deadline.timeIntervalSinceNow>0){[session check];usleep(50000);}}[session check];enabled=CUAXChangeAccessibilityAttribute(axApp,ordinary.unsignedIntegerValue?CFSTR("AXEnhancedUserInterface"):CFSTR("AXManualAccessibility"));};
      NSNumber *current=CUAXWritableAccessibilityState(axApp,ordinary.unsignedIntegerValue?CFSTR("AXEnhancedUserInterface"):CFSTR("AXManualAccessibility"));
      if([current isKindOfClass:NSNumber.class]&&![current boolValue]){if(ordinary.unsignedIntegerValue==1&&[bundle isEqual:@"com.spotify.client"]&&!app.active)CUWithTransientInputFocus(session,target,enable);else enable();}
      if(enabled)changed=YES;else{[coordinator end:app mode:ordinary];[modes removeObject:ordinary];}
    }}@finally{[coordinator.lock unlock];}}
    BOOL browser=[@[@"company.thebrowser.Browser",@"company.thebrowser.dia"]containsObject:bundle],atlas=[bundle hasPrefix:@"com.openai.atlas"];
    if([bundle isEqual:@"com.microsoft.Excel"]||[bundle isEqual:@"com.apple.Music"]||atlas||(context==0&&browser)){
      [coordinator.lock lock];@try{BOOL first=[coordinator begin:app mode:@2];[modes addObject:@2];if(first){NSUserDefaults *defaults=[[NSUserDefaults alloc]initWithSuiteName:@"com.apple.universalaccess"];
        if(!defaults||[defaults boolForKey:CUAXVoiceOverKey]){[coordinator end:app mode:@2];[modes removeObject:@2];}else{[defaults setBool:YES forKey:CUAXVoiceOverKey];CUAXPostVoiceOverChange();if(browser||atlas)dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_global_queue(QOS_CLASS_DEFAULT,0),^{[defaults setBool:NO forKey:CUAXVoiceOverKey];});}
      }}@finally{[coordinator.lock unlock];}
    }
    [coordinator.lock lock];BOOL initialized=[coordinator.initialized containsObject:app];[coordinator.lock unlock];
    if((changed||CUAXWindowNeedsSettling(window))&&([modes containsObject:@0]||!initialized)&&CUAXSettleAccessibility(session,window)){[coordinator.lock lock];[coordinator.initialized addObject:app];[coordinator.lock unlock];}
    return modes.count?assertion:nil;
  }@catch(NSException *error){[assertion disable];@throw;}
}
@interface CUAXHierarchyAPI : NSObject
@property void *image;
@property AXError (*copyHierarchy)(AXUIElementRef,CFArrayRef,CFDictionaryRef,CFTypeRef *);
@property(strong) NSArray<NSString *> *keys;
+ (instancetype)shared;
@end
@implementation CUAXHierarchyAPI
+ (instancetype)shared {
  static CUAXHierarchyAPI *api;static dispatch_once_t once;dispatch_once(&once,^{api=[CUAXHierarchyAPI new];api.image=dlopen("/System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/HIServices.framework/Versions/A/HIServices",RTLD_LAZY|RTLD_LOCAL);
    if(!api.image)return;api.copyHierarchy=dlsym(api.image,"AXUIElementCopyHierarchy");if(!api.copyHierarchy)api.copyHierarchy=dlsym(api.image,"_AXUIElementCopyHierarchy");
    NSMutableArray *keys=[NSMutableArray new];for(NSString *name in @[@"kAXUIElementCopyHierarchySkipInspectionForAttributesKey",@"kAXUIElementCopyHierarchyArrayAttributesKey",@"kAXUIElementCopyHierarchyTruncateStringsKey",@"kAXUIElementCopyHierarchyMaxArrayCountKey",@"kAXUIElementCopyHierarchyResultValueKey",@"kAXUIElementCopyHierarchyResultCountKey",@"kAXUIElementCopyHierarchyIncompleteResultKey"]){CFStringRef *cell=dlsym(api.image,name.UTF8String);if(!cell)cell=dlsym(api.image,[@"_"stringByAppendingString:name].UTF8String);if(!cell||!*cell||CFGetTypeID(*cell)!=CFStringGetTypeID())return;[keys addObject:(__bridge NSString *)*cell];}api.keys=keys;
  });
  if(!api.copyHierarchy||api.keys.count!=7)CUFail(@"ACCESSIBILITY_SPI_UNAVAILABLE",@"The native accessibility hierarchy API is unavailable.");return api;
}
@end
static NSArray<NSString *> *CUAXPrefetchScalarAttributes(void) {
  return @[@"AXRole",@"AXSubrole",@"AXRoleDescription",@"AXTitle",@"AXDescription",@"AXValue",@"AXValueDescription",@"AXPlaceholderValue",@"AXNumberOfCharacters",@"AXHelp",@"AXIdentifier",@"AXSelected",@"AXFocused",@"AXEnabled",@"AXDisclosing",@"AXURL",@"AXTraits",@"AXServesAsTitleForUIElements",@"AXRowIndexRange",@"AXColumnIndexRange",@"AXSelectedRows",@"AXSelectedCells",@"AXSelectedChildren"];
}
static NSDictionary *CUAXDecodeHierarchyAttributes(NSDictionary *raw,NSArray<NSString *> *arrayAttributes,CUAXHierarchyAPI *api) {
  NSMutableDictionary *decoded=[NSMutableDictionary new];NSString *valueKey=api.keys[4],*countKey=api.keys[5];
  for(id name in raw){id result=raw[name];if(![name isKindOfClass:NSString.class]||![result isKindOfClass:NSDictionary.class])continue;
    CUAXPartialValue *partial=[CUAXPartialValue new];partial.value=result[valueKey]?:NSNull.null;id count=result[countKey];
    if([partial.value isKindOfClass:NSArray.class]){NSUInteger actual=[partial.value count];partial.arrayCount=@(actual);if([arrayAttributes containsObject:name]&&[count isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)count)!=CFBooleanGetTypeID()&&[count integerValue]>=0&&actual<[count unsignedIntegerValue]){partial.arrayCount=count;partial.availableRanges=@[[NSValue valueWithRange:NSMakeRange(0,actual)]];}}
    if([name isEqual:@"AXValue"]&&[partial.value isKindOfClass:NSString.class]){id number=raw[@"AXNumberOfCharacters"];id total=[number isKindOfClass:NSDictionary.class]?number[valueKey]:nil;if([total isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)total)!=CFBooleanGetTypeID()&&[total integerValue]>=0){partial.textCount=total;partial.textRange=[NSValue valueWithRange:NSMakeRange(0,[partial.value length])];}}
    decoded[name]=partial;
  }return decoded;
}
static void CUAXPrefetchHierarchy(CUSession *session,CUAXTransaction *transaction,AXUIElementRef root,NSArray<NSString *> *scalarAttributes,NSArray<NSString *> *arrayAttributes,NSUInteger maxChildren) {
  [session check];CUAXHierarchyAPI *api=CUAXHierarchyAPI.shared;NSDictionary *options=@{api.keys[0]:scalarAttributes,api.keys[1]:arrayAttributes,api.keys[2]:@YES,api.keys[3]:@(maxChildren)};
  __block CFTypeRef hierarchy=NULL;pid_t pid=0;AXUIElementGetPid(root,&pid);void (^read)(void)=^{api.copyHierarchy(root,(__bridge CFArrayRef)scalarAttributes,(__bridge CFDictionaryRef)options,&hierarchy);};
  if(pid==getpid()&&!NSThread.isMainThread)dispatch_sync(dispatch_get_main_queue(),read);else read();id raw=hierarchy?CFBridgingRelease(hierarchy):nil;if(![raw isKindOfClass:NSDictionary.class])return;
  for(id key in raw){id attributes=raw[key];if(CFGetTypeID((__bridge CFTypeRef)key)!=AXUIElementGetTypeID()||![attributes isKindOfClass:NSDictionary.class])continue;
    id incomplete=attributes[api.keys[6]];if([incomplete isKindOfClass:NSNumber.class]&&[incomplete boolValue])CUAXPrefetchHierarchy(session,transaction,(__bridge AXUIElementRef)key,scalarAttributes,arrayAttributes,maxChildren);
    else{NSDictionary *decoded=CUAXDecodeHierarchyAttributes(attributes,arrayAttributes,api);CFDictionarySetValue(transaction->records,(__bridge CFTypeRef)key,(__bridge CFTypeRef)decoded);}
  }
}
static id CUAXMembershipValue(AXUIElementRef element,CFStringRef attribute,BOOL *unreadable) {
  CUAXPartialValue *partial=CUAXCapturedPartial(element,attribute);
  if(partial&&partial.value!=NSNull.null)return partial.value;
  __block CFTypeRef value=NULL;__block AXError error=kAXErrorFailure;pid_t pid=0;AXUIElementGetPid(element,&pid);
  void (^read)(void)=^{error=AXUIElementCopyAttributeValue(element,attribute,&value);};
  if(pid==getpid()&&!NSThread.isMainThread)dispatch_sync(dispatch_get_main_queue(),read);else read();
  if(error!=kAXErrorSuccess){if(value)CFRelease(value);if(error!=kAXErrorAttributeUnsupported&&error!=kAXErrorNoValue)*unreadable=YES;return nil;}
  return value?CFBridgingRelease(value):nil;
}
static void CUAXReconcileSourceElements(CUWindow *target,CUWindow *capture,NSArray<NSMutableDictionary *> *rows) {
  NSMutableDictionary<NSString *,CUElement *> *current=[NSMutableDictionary new];NSMutableSet<NSString *> *main=[NSMutableSet new];
  CFMutableSetRef mainObjects=CFSetCreateMutable(NULL,0,&kCFTypeSetCallBacks);
  CFMutableSetRef formerMainObjects=CFSetCreateMutable(NULL,0,&kCFTypeSetCallBacks);
  for(NSDictionary *row in rows){CUElement *element=capture.elements[row[@"element_index"]];current[element.identifier]=element;if(![row[@"_focus_only"]boolValue]){[main addObject:element.identifier];CFSetAddValue(mainObjects,element.ax);}}
  CUAXRevision *source=CUAXRecordedRevision(target,YES),*published=CUAXRecordedRevision(target,NO);
  for(NSArray<CUAXNode *> *nodes in @[source.sources?:@[],published.sources?:@[]])for(CUAXNode *node in nodes){
    if(!node.focusOnly||CUAXReferenceIsRetired(node.element))CFSetAddValue(formerMainObjects,node.element.ax);
    CUElement *fresh=current[node.element.identifier];
    // A retained detached Cocoa view may still be reported as focused. That
    // supplemental capture does not keep its former window-tree reference alive.
    BOOL retained=fresh&&CFEqual(node.element.ax,fresh.ax)&&(node.focusOnly||[main containsObject:node.element.identifier]);
    if(!retained)objc_setAssociatedObject(node.element,&CUAXRetiredReferenceKey,@YES,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  for(NSDictionary *row in rows){CUElement *element=capture.elements[row[@"element_index"]];
    if([row[@"_focus_only"]boolValue]&&CFSetContainsValue(formerMainObjects,element.ax)&&!CFSetContainsValue(mainObjects,element.ax))objc_setAssociatedObject(element,&CUAXRetiredReferenceKey,@YES,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  CFRelease(mainObjects);CFRelease(formerMainObjects);
}
static void CUWalk(CUSession *session,CUWindow *target,AXUIElementRef element,NSUInteger depth,NSUInteger maxDepth,NSUInteger maxNodes,NSMutableArray *rows,CFMutableSetRef seen,CFDictionaryRef previous,BOOL *truncated,BOOL *unreadable,BOOL recurse,BOOL chromium) {
  [session check];if(CFSetContainsValue(seen,element))return;if(depth>maxDepth||rows.count>=maxNodes){*truncated=YES;return;}CFSetAddValue(seen,element);
  NSArray *keys=@[(__bridge id)kAXRoleAttribute,(__bridge id)kAXTitleAttribute,(__bridge id)kAXDescriptionAttribute,(__bridge id)kAXValueAttribute,(__bridge id)kAXEnabledAttribute,(__bridge id)kAXPositionAttribute,(__bridge id)kAXSizeAttribute,(__bridge id)kAXChildrenAttribute,(__bridge id)kAXIdentifierAttribute,(__bridge id)kAXSubroleAttribute,(__bridge id)kAXRoleDescriptionAttribute,(__bridge id)CFSTR("AXValueDescription"),(__bridge id)kAXPlaceholderValueAttribute,(__bridge id)kAXHelpAttribute,(__bridge id)kAXURLAttribute,(__bridge id)kAXFocusedAttribute];
  NSMutableArray *v=[NSMutableArray new];for(NSString *key in keys){BOOL membership=[key isEqual:(__bridge id)kAXRoleAttribute]||[key isEqual:(__bridge id)kAXChildrenAttribute];id attribute=membership?CUAXMembershipValue(element,(__bridge CFStringRef)key,unreadable):CUAXCaptured(element,(__bridge CFStringRef)key);[v addObject:attribute?:NSNull.null];}
  NSString *role=CUString(v[0]),*title=CUString(v[1]),*description=CUString(v[2]),*value=nil;if(!role.length){*unreadable=YES;role=@"AXUnknown";}
  if(v[7]!=NSNull.null&&![v[7]isKindOfClass:NSArray.class])*unreadable=YES;
  if([role isEqualToString:@"AXMenu"]){
    CGSize menuSize={0};
    if(CFGetTypeID((__bridge CFTypeRef)v[6])!=AXValueGetTypeID()||!AXValueGetValue((__bridge AXValueRef)v[6],kAXValueCGSizeType,&menuSize)||menuSize.width<=0||menuSize.height<=0)return;
  }
  CFArrayRef actionValues=NULL;AXUIElementCopyActionNames(element,&actionValues);NSArray *actions=actionValues?CFBridgingRelease(actionValues):@[];
  NSMutableArray *actionDescriptions=[NSMutableArray new];for(NSString *action in actions){CFStringRef actionDescription=NULL;if(AXUIElementCopyActionDescription(element,(__bridge CFStringRef)action,&actionDescription)==kAXErrorSuccess&&actionDescription){NSString *description=CFBridgingRelease(actionDescription);[actionDescriptions addObject:@{@"name":action,@"description":description}];}else if(actionDescription)CFRelease(actionDescription);}
  NSUInteger index=rows.count;NSNumber *number=@(index);
  CUElement *record=(__bridge CUElement *)CFDictionaryGetValue(previous,element);
  if(!record||CUAXReferenceIsRetired(record))record=[[CUElement alloc]initWithElement:element];target.elements[number]=record;
  NSMutableDictionary *row=[@{@"element_index":number,@"element_id":record.identifier,@"element_token":[NSString stringWithFormat:@"%@:%lu",target.snapshotId,index],@"role":role,@"label":title.length?title:description,@"depth":@(depth),@"actions":actions} mutableCopy];
  row[@"action_descriptions"]=actionDescriptions;
  NSMutableDictionary *signature=[NSMutableDictionary new],*attributes=[NSMutableDictionary new];
  NSDictionary *signatureIndexes=@{@"role":@0,@"title":@1,@"description":@2,@"value":@3,@"identifier":@8,@"subrole":@9,@"role_description":@10,@"value_description":@11,@"placeholder":@12,@"help":@13,@"url":@14};
  for(NSString *key in signatureIndexes){id attribute=v[[signatureIndexes[key]unsignedIntegerValue]];if([key isEqual:@"url"]){signature[key]=[attribute isKindOfClass:NSURL.class]?attribute:([attribute isKindOfClass:NSString.class]?[NSURL URLWithString:attribute]:nil)?:NSNull.null;attributes[key]=signature[key];}else{signature[key]=([attribute isKindOfClass:NSString.class]||[attribute isKindOfClass:NSNumber.class]||[attribute isKindOfClass:NSDate.class])?attribute:NSNull.null;attributes[key]=[attribute isKindOfClass:NSString.class]?attribute:NSNull.null;}}
  row[@"_signature"]=signature;row[@"_attributes"]=attributes;row[@"focused"]=[v[15]isKindOfClass:NSNumber.class]?v[15]:@NO;
  id titleTargets=CUAXCaptured(element,CFSTR("AXServesAsTitleForUIElements"));if([titleTargets isKindOfClass:NSArray.class])row[@"_title_targets"]=titleTargets;
  CUAXPartialValue *childrenPartial=CUAXCapturedPartial(element,kAXChildrenAttribute);row[@"_available_subset"]=@(childrenPartial.availableRanges!=nil);if(childrenPartial.availableRanges){*truncated=YES;row[@"_available_subset_count"]=childrenPartial.arrayCount;row[@"_available_subset_ranges"]=childrenPartial.availableRanges;}
  CFTypeID valueType=CFGetTypeID((__bridge CFTypeRef)v[3]);BOOL stringValueEligible=valueType==CFStringGetTypeID()||[v[3]isKindOfClass:NSNull.class]||valueType==AXValueGetTypeID();row[@"_string_value_eligible"]=@(stringValueEligible);
  if([role isEqual:@"AXTextField"]||[role isEqual:@"AXTextArea"]){NSString *placeholder=CUString(v[12]);if(placeholder.length)row[@"placeholder"]=placeholder;}
  if([role isEqualToString:@"AXMenuItem"]){
    NSString *character=CUString(CUAXCaptured(element,kAXMenuItemCmdCharAttribute));
    if(character.length){id modifiers=CUAXCaptured(element,kAXMenuItemCmdModifiersAttribute),virtualKey=CUAXCaptured(element,kAXMenuItemCmdVirtualKeyAttribute);row[@"shortcut"]=@{@"character":character,@"modifiers":[modifiers isKindOfClass:NSNumber.class]?modifiers:@0,@"virtual_key":[virtualKey isKindOfClass:NSNumber.class]?virtualKey:@(-1)};}
  }
  CGPoint position={0};CGSize size={0};
  if(CFGetTypeID((__bridge CFTypeRef)v[5])==AXValueGetTypeID()&&CFGetTypeID((__bridge CFTypeRef)v[6])==AXValueGetTypeID()&&AXValueGetValue((__bridge AXValueRef)v[5],kAXValueCGPointType,&position)&&AXValueGetValue((__bridge AXValueRef)v[6],kAXValueCGSizeType,&size))row[@"frame"]=@{@"x":@(position.x),@"y":@(position.y),@"w":@(size.width),@"h":@(size.height)};
  row[@"enabled"]=[v[4]isKindOfClass:NSNumber.class]?v[4]:@YES;
  CFArrayRef attributeValues=NULL;AXError attributeError=AXUIElementCopyAttributeNames(element,&attributeValues);NSArray *supported=attributeValues?CFBridgingRelease(attributeValues):@[];
  row[@"_supported_attributes"]=supported;
  Boolean selectable=false,focusable=false;
  if(attributeError==kAXErrorSuccess&&[supported containsObject:(__bridge id)kAXSelectedAttribute]&&![@[@"AXMenuItem",@"AXMenuBarItem"]containsObject:role])AXUIElementIsAttributeSettable(element,kAXSelectedAttribute,&selectable);
  if(attributeError==kAXErrorSuccess&&[supported containsObject:(__bridge id)kAXFocusedAttribute]){
    AXError focusError=AXUIElementIsAttributeSettable(element,kAXFocusedAttribute,&focusable);
    if(focusError!=kAXErrorSuccess)focusable=[@[@"AXTextArea",@"AXTextField",@"AXDateTimeArea"]containsObject:role]?[row[@"enabled"]boolValue]:false;
  }
  row[@"selectable"]=@(selectable);row[@"focusable"]=@(focusable);
  Boolean valueSettable=false;BOOL hasValue=[v[3]isKindOfClass:NSString.class]||[v[3]isKindOfClass:NSNumber.class]||[v[3]isKindOfClass:NSDate.class];
  NSString *parentRole=nil;if(chromium&&[role isEqual:@"AXIncrementor"]){id parent=CUAXCaptured(element,kAXParentAttribute);if(parent&&CFGetTypeID((__bridge CFTypeRef)parent)==AXUIElementGetTypeID())parentRole=CUString(CUAXCaptured((__bridge AXUIElementRef)parent,kAXRoleAttribute));}
  if(hasValue&&(!chromium||CUAXChromiumValueRole(role,CUString(v[9]),parentRole))&&attributeError==kAXErrorSuccess&&[supported containsObject:(__bridge id)kAXValueAttribute])AXUIElementIsAttributeSettable(element,kAXValueAttribute,&valueSettable);row[@"value_settable"]=@(valueSettable);
  id selectedValue=CUAXCaptured(element,kAXSelectedAttribute),disclosing=CUAXCaptured(element,kAXDisclosingAttribute);if(![selectedValue isKindOfClass:NSNumber.class]){id traits=CUAXCaptured(element,CFSTR("AXTraits"));selectedValue=@([traits isKindOfClass:NSNumber.class]&&([traits unsignedLongLongValue]&8)!=0);}row[@"selected"]=selectedValue;row[@"disclosable"]=@([disclosing isKindOfClass:NSNumber.class]);row[@"disclosing"]=[disclosing isKindOfClass:NSNumber.class]?disclosing:@NO;
  NSString *typeName=@"unknown";if(valueType==CFNumberGetTypeID())typeName=CFNumberIsFloatType((__bridge CFNumberRef)v[3])?@"float":@"integer";else if(valueType==CFBooleanGetTypeID())typeName=@"boolean";else if(valueType==CFStringGetTypeID())typeName=@"string";else if(valueType==CFDateGetTypeID())typeName=@"date";else if([@[@"AXTextArea",@"AXTextField"]containsObject:role])typeName=@"string";
  if(hasValue&&[role isEqual:@"AXCheckBox"]&&[@[@"AXSwitch",@"AXToggle"]containsObject:CUString(v[9])])typeName=@"boolean";row[@"value_type_name"]=typeName;
  value=CUAXDisplayValue(v[3],typeName,element);NSValue *truncation=nil;if(valueType==CFStringGetTypeID())value=CUAXNormalizeString(element,value,[@[@"AXTextArea",@"AXTextField",@"AXStaticText"]containsObject:role],CUAXCapturedPartial(element,kAXValueAttribute),&truncation);if(truncation){row[@"_truncation_range"]=truncation;row[@"value_settable"]=@NO;}attributes[@"value"]=value?:NSNull.null;if(value)row[@"value"]=value;else[row removeObjectForKey:@"value"];
  row[@"render_attributes_known"]=@YES;
  id classes=CUAXCaptured(element,CFSTR("AXDOMClassList"));row[@"sent_by_current_user"]=@([classes isKindOfClass:NSArray.class]&&[classes containsObject:@"is-sender"]);
  for(NSArray *pair in @[@[@"AXRowIndexRange",@"row_index_range"],@[@"AXColumnIndexRange",@"column_index_range"]]){id attribute=CUAXCaptured(element,(__bridge CFStringRef)pair[0]);CFRange range={0};if(attribute&&CFGetTypeID((__bridge CFTypeRef)attribute)==AXValueGetTypeID()&&AXValueGetValue((__bridge AXValueRef)attribute,kAXValueCFRangeType,&range)&&range.location>=0&&range.length>0&&range.location<=LONG_MAX-(range.length-1))row[pair[1]]=@[@(range.location),@(range.location+range.length-1)];}
  [rows addObject:row];
  if(recurse&&[v[7] isKindOfClass:NSArray.class])for(id child in v[7]){if(CFGetTypeID((__bridge CFTypeRef)child)==AXUIElementGetTypeID())CUWalk(session,target,(__bridge AXUIElementRef)child,depth+1,maxDepth,maxNodes,rows,seen,previous,truncated,unreadable,YES,chromium);else *unreadable=YES;}
}
NSDictionary *CUObserve(CUSession *session,NSDictionary *args) {
  CUWindow *target=CUResolveWindow(session,args);
  if(!target.sourceAXDiffingEnabled){target.sourceAXDiffingEnabled=@NO;if(CUAXUsesAppContext(args))objc_setAssociatedObject(CUAXCaptureOwner(target),&CUAXAppDiffingKey,@NO,OBJC_ASSOCIATION_RETAIN_NONATOMIC);}
  BOOL enableAXDiffing=target.sourceAXDiffingEnabled.boolValue&&![args[@"disable_diffing"]boolValue];
  id context=args[@"context_type"];if(context&&(![context isKindOfClass:NSNumber.class]||[context doubleValue]!=[context integerValue]||[context integerValue]<0||[context integerValue]>2))CUFail(@"INVALID_CONTEXT",@"The accessibility context must be 0, 1, or 2.");
  BOOL tree=args[@"include_accessibility_tree"]?[args[@"include_accessibility_tree"] boolValue]:YES,shot=args[@"include_screenshot"]?[args[@"include_screenshot"] boolValue]:YES;
  if(!tree&&!shot)CUFail(@"EMPTY_OBSERVATION",@"Request the accessibility tree, a screenshot, or both.");
  NSMutableDictionary *state=[@{@"pid":@(target.pid),@"window_id":@(target.windowId),@"window_bounds":@{@"x":@(target.bounds.origin.x),@"y":@(target.bounds.origin.y),@"width":@(target.bounds.size.width),@"height":@(target.bounds.size.height)}} mutableCopy];
  NSMutableArray *content=[NSMutableArray new];
  CUWindow *treeSnapshot=nil;CUAXRevision *revision=nil;id capturedRoot=nil;BOOL refetchOnly=[args[@"refetch_only"]boolValue];
  if(tree){
    if(!AXIsProcessTrusted())CUFail(@"ACCESSIBILITY_PERMISSION",@"Enable Accessibility for Oh My DSH Computer Use in macOS Settings.");
    AXUIElementRef app=AXUIElementCreateApplication(target.pid);

    CFMutableDictionaryRef previous=CFDictionaryCreateMutable(NULL,0,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);
    CFMutableSetRef seen=CFSetCreateMutable(NULL,0,&kCFTypeSetCallBacks);
    CUAXEnablementAssertion *assertion=nil;NSMutableDictionary *threadScope=NSThread.currentThread.threadDictionary;CUAXTransaction *previousTransaction=threadScope[CUAXTransactionThreadKey];
    @try{
      // Compare actual AX objects. Labels, tree positions and application-supplied
      // identifiers can be duplicated or reused by replacement controls.
      CUAXRevision *prior=CUAXRecordedRevision(target,NO),*source=CUAXRecordedRevision(target,YES)?:prior;
      if(source)for(CUAXNode *node in source.sources)CFDictionarySetValue(previous,node.element.ax,(__bridge const void *)node.element);
      else for(CUElement *element in target.elements.allValues)CFDictionarySetValue(previous,element.ax,(__bridge const void *)element);
      NSArray *windows=CUAX(app,kAXWindowsAttribute);AXUIElementRef selected=NULL;
      for(id w in windows)if(CUAXWindowId((__bridge AXUIElementRef)w)==target.windowId){selected=(__bridge AXUIElementRef)w;break;}
      capturedRoot=selected?(__bridge id)selected:nil;
      if(!args[@"perform_accessibility_enablement"]||[args[@"perform_accessibility_enablement"]boolValue])assertion=CUAXEnableAccessibility(session,target,app,selected,[args[@"context_type"]unsignedIntegerValue]);
      treeSnapshot=[CUWindow new];treeSnapshot.snapshotId=NSUUID.UUID.UUIDString;NSMutableArray *rows=[NSMutableArray new],*lines=[NSMutableArray new];
      BOOL truncated=NO,unreadable=NO,selectedLeaves=YES;NSNumber *focusedIndex=nil;NSMutableArray<NSNumber *> *selectedIndexes=[NSMutableArray new];
      if(selected){
        NSUInteger depth=MIN([args[@"max_depth"]unsignedIntegerValue]?:200,200),limit=[args[@"max_elements"]unsignedIntegerValue]?:NSUIntegerMax;
        BOOL chromium=CUAXChromiumWindow(target.pid,selected);
        CUAXTransaction *transaction=[CUAXTransaction new];if(!args[@"prefetch_enabled"]||[args[@"prefetch_enabled"]boolValue])CUAXPrefetchHierarchy(session,transaction,selected,CUAXPrefetchScalarAttributes(),@[@"AXChildren"],[args[@"context_type"]unsignedIntegerValue]==1&&CUAXWebShapedApplication(target.pid)?20:100);threadScope[CUAXTransactionThreadKey]=transaction;
        state[@"window_title"]=CUString(CUAX(selected,kAXTitleAttribute));
        CUWalk(session,treeSnapshot,selected,0,depth,limit,rows,seen,previous,&truncated,&unreadable,YES,chromium);
        id menu=CUAX(app,kAXMenuBarAttribute);if(menu)CUWalk(session,treeSnapshot,(__bridge AXUIElementRef)menu,0,depth,limit,rows,seen,previous,&truncated,&unreadable,YES,chromium);
        id focused=CUAX(app,kAXFocusedUIElementAttribute);
        if(!CUAXUsesAppContext(args)&&focused&&CFGetTypeID((__bridge CFTypeRef)focused)==AXUIElementGetTypeID()){id focusedWindow=CUAX((__bridge AXUIElementRef)focused,kAXWindowAttribute);if(focusedWindow&&CFGetTypeID((__bridge CFTypeRef)focusedWindow)==AXUIElementGetTypeID()){CGWindowID focusedWindowId=CUAXWindowId((__bridge AXUIElementRef)focusedWindow);if(focusedWindowId&&focusedWindowId!=target.windowId)focused=nil;}}
        if(focused&&CFGetTypeID((__bridge CFTypeRef)focused)==AXUIElementGetTypeID()){
          for(NSNumber *index in treeSnapshot.elements)if(CFEqual(treeSnapshot.elements[index].ax,(__bridge CFTypeRef)focused)){focusedIndex=index;break;}
          id selection=CUAX((__bridge AXUIElementRef)focused,kAXSelectedTextAttribute);
          if([selection isKindOfClass:NSString.class]&&[selection length])state[@"selected_text"]=selection;
          NSArray *selectedElements=@[];for(NSString *attribute in @[@"AXSelectedRows",@"AXSelectedCells",@"AXSelectedChildren"]){id candidates=CUAXCaptured((__bridge AXUIElementRef)focused,(__bridge CFStringRef)attribute);if([candidates isKindOfClass:NSArray.class]&&[candidates count]){selectedElements=candidates;break;}}
          NSMutableArray *missing=[NSMutableArray new];for(id selectedElement in selectedElements){if(CFGetTypeID((__bridge CFTypeRef)selectedElement)!=AXUIElementGetTypeID())continue;NSNumber *found=nil;for(NSNumber *index in treeSnapshot.elements)if(CFEqual(treeSnapshot.elements[index].ax,(__bridge CFTypeRef)selectedElement)){found=index;break;}if(!found)[missing addObject:selectedElement];}
          selectedLeaves=missing.count==0;
          for(id selectedElement in missing){NSUInteger start=rows.count;CUWalk(session,treeSnapshot,(__bridge AXUIElementRef)selectedElement,0,depth,limit,rows,seen,previous,&truncated,&unreadable,YES,chromium);for(NSUInteger i=start;i<rows.count;i++)rows[i][@"_focus_only"]=@YES;}
          for(id selectedElement in selectedElements)if(CFGetTypeID((__bridge CFTypeRef)selectedElement)==AXUIElementGetTypeID())for(NSNumber *index in treeSnapshot.elements)if(CFEqual(treeSnapshot.elements[index].ax,(__bridge CFTypeRef)selectedElement)){[selectedIndexes addObject:index];break;}
          if(!focusedIndex)for(NSNumber *index in treeSnapshot.elements)if(CFEqual(treeSnapshot.elements[index].ax,(__bridge CFTypeRef)focused)){focusedIndex=index;break;}
          if(!focusedIndex){NSUInteger start=rows.count;CUWalk(session,treeSnapshot,(__bridge AXUIElementRef)focused,0,depth,limit,rows,seen,previous,&truncated,&unreadable,NO,chromium);for(NSUInteger i=start;i<rows.count;i++)rows[i][@"_focus_only"]=@YES;if(rows.count>start)focusedIndex=rows[start][@"element_index"];}
          if(focusedIndex)state[@"focused_element_index"]=focusedIndex;
        }
      }else{state[@"degraded_reason"]=@"ax_window_unresolved";}
      id catalystValue=CUAX(app,CFSTR("_AXExhibitsMacCatalystBehavior"));BOOL catalyst=[catalystValue isKindOfClass:NSNumber.class]&&[catalystValue boolValue];for(NSMutableDictionary *row in rows)row[@"_catalyst"]=@(catalyst);
      if(selected&&!truncated&&!unreadable)CUAXReconcileSourceElements(target,treeSnapshot,rows);
      if(focusedIndex&&CUAXReferenceIsRetired(treeSnapshot.elements[focusedIndex])){[state removeObjectForKey:@"focused_element_index"];[state removeObjectForKey:@"selected_text"];}
      revision=CUAXBuildRevision(treeSnapshot,rows,refetchOnly?nil:prior,args,enableAXDiffing,truncated||unreadable,focusedIndex,selectedIndexes,selectedLeaves);
      NSMutableArray *renderedRows=[NSMutableArray new],*focusedRows=[NSMutableArray new];[lines removeAllObjects];NSMutableDictionary *published=[NSMutableDictionary new];
      for(CUAXNode *node in revision.renders){[renderedRows addObject:node.row];published[node.row[@"element_index"]]=node.element;[lines addObject:node.row[@"render_line"]];}
      for(CUAXNode *node in revision.focusRenders){[focusedRows addObject:node.row];published[node.row[@"element_index"]]=node.element;}
      treeSnapshot.elements=published;
      state[@"snapshot_id"]=treeSnapshot.snapshotId;state[@"revision_id"]=revision.identifier;state[@"initial_revision_id"]=revision.initialIdentifier;if(revision.previousIdentifier)state[@"previous_revision_id"]=revision.previousIdentifier;
      state[@"ax_diffing_enabled"]=@(enableAXDiffing);
      state[@"revision_changes"]=revision.changes;state[@"cumulative_revision_changes"]=revision.cumulativeChanges;state[@"elements"]=renderedRows;state[@"element_count"]=@(renderedRows.count);state[@"tree_markdown"]=[lines componentsJoinedByString:@"\n"];
      state[@"focus_elements"]=focusedRows;
      NSDictionary *windowInfo=objc_getAssociatedObject(target,&CUAXResolvedWindowInfoKey);NSRunningApplication *runningApp=[NSRunningApplication runningApplicationWithProcessIdentifier:target.pid];NSString *title=windowInfo[(id)kCGWindowName];
      if(![title isKindOfClass:NSString.class]||!title.length){title=[state[@"window_title"]length]?state[@"window_title"]:nil;if(!title&&[windowInfo[(id)kCGWindowLayer]integerValue]==CGWindowLevelForKey(kCGDesktopIconWindowLevelKey)&&[runningApp.bundleIdentifier isEqual:@"com.apple.finder"])title=@"Desktop";}if(!title)title=@"Unknown";
      NSString *appName=runningApp.localizedName?:windowInfo[(id)kCGWindowOwnerName];if(![appName isKindOfClass:NSString.class])appName=@"Unknown";
      state[@"render_window_reference"]=[NSString stringWithFormat:@"Window: \"%@\"",title];state[@"render_heading"]=[NSString stringWithFormat:@"%@, App: %@.",state[@"render_window_reference"],appName];
      NSString *selectedText=state[@"selected_text"];NSMutableString *footer=[NSMutableString new];BOOL hasSelection=NO;
      if(selectedText){[footer appendFormat:@"\nSelected text: ```\n%@\n```",selectedText];hasSelection=YES;}
      else if(focusedRows.count>1){NSMutableArray *selectionLines=[NSMutableArray new];for(NSUInteger i=1;i<focusedRows.count;i++)[selectionLines addObject:focusedRows[i][@"render_line"]];[footer appendFormat:@"\nSelected:\n%@",[selectionLines componentsJoinedByString:@"\n"]];hasSelection=YES;}
      else if(focusedRows.count==1)[footer appendFormat:@"\nThe focused UI element is %@",focusedRows[0][@"render_line"]];
      if(hasSelection)[footer appendString:@"\n\nNote: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that's visible, too)."];
      state[@"render_footer"]=footer;
      state[@"verified_ax_pipeline"]=@[@"macActionFilter",@"associateTitleUIElements",@"flattenIntoSelectableAncestor",@"pruneNonDescriptiveSubtrees",@"pruneEmptyDisabledElements",@"mergeSingleItemGroups",@"flattenRedundantHierarchy",@"flattenRepetitiveStaticText",@"flattenLinksIntoMarkdownText",@"mergeTextOnlySiblings",@"calendarEventContraction",@"attributedTextRepresentation",@"webAreaAttributedTextRepresentation"];
      state[@"ax_context_type"]=@([args[@"context_type"]unsignedIntegerValue]);state[@"ax_pipeline_limitations"]=@[];
      if(truncated)state[@"truncated"]=@YES;if(unreadable)state[@"unreadable"]=@YES;
    }@finally{@try{[assertion disable];}@finally{if(previousTransaction)threadScope[CUAXTransactionThreadKey]=previousTransaction;else[threadScope removeObjectForKey:CUAXTransactionThreadKey];CFRelease(seen);CFRelease(previous);CFRelease(app);}}
  }
  [session check];
  if(shot){
    @try {
      NSDictionary *capture=CUCaptureResult(session,target,args);
      CURecordScreenshotMapping(target,[capture[@"sourceVisibleRect"]rectValue],[capture[@"sourcePointsPerPixel"]doubleValue]);
      state[@"screenshot_width"]=capture[@"width"];state[@"screenshot_height"]=capture[@"height"];state[@"screenshot_scale"]=@(target.screenshotScale);state[@"screenshot_mime_type"]=capture[@"mimeType"];
      [content addObject:@{@"type":@"image",@"mimeType":capture[@"mimeType"],@"data":capture[@"data"]}];
    } @catch(NSException *error) {
      CURecordScreenshotMapping(target,CGRectNull,0);
      BOOL optional=tree&&[args[@"allow_missing_screenshot"] boolValue];
      if(!optional||![@[@"CAPTURE_UNAVAILABLE",@"CAPTURE_TIMEOUT",@"CAPTURE_ENCODING_FAILED"] containsObject:error.name])@throw;
      state[@"screenshot_error"]=@{@"code":error.name,@"message":error.reason?:@"The window screenshot is unavailable."};
    }
  }
  [session check];
  if(treeSnapshot){
    BOOL complete=![state[@"truncated"]boolValue]&&![state[@"unreadable"]boolValue]&&!state[@"degraded_reason"];
    if(!refetchOnly||complete){CUAXRecordRevision(target,revision,YES);CUWindowRegistryDidCapture(target,capturedRoot?(__bridge AXUIElementRef)capturedRoot:NULL);}
    if(!refetchOnly){target.elements=treeSnapshot.elements;target.snapshotId=treeSnapshot.snapshotId;CUAXRecordRevision(target,revision,NO);for(CUAXNode *node in revision.sources)objc_setAssociatedObject(node.element,&CUAXSignatureKey,node.signature,OBJC_ASSOCIATION_RETAIN_NONATOMIC);}
  }
  [content addObject:@{@"type":@"text",@"text":state[@"tree_markdown"]?:@"Window screenshot captured."}];return @{@"structuredContent":state,@"content":content};
}
NSDictionary *CUResult(id value) { NSData *json=[NSJSONSerialization dataWithJSONObject:value?:@{} options:0 error:nil];return @{@"structuredContent":value?:@{},@"content":@[@{@"type":@"text",@"text":[[NSString alloc]initWithData:json encoding:NSUTF8StringEncoding]?:@"{}"}]}; }

static BOOL CUAXSignatureMatches(NSDictionary *old,NSDictionary *fresh,BOOL ignoreValueChange) {
  if(![old[@"role"]isKindOfClass:NSString.class]||![fresh[@"role"]isKindOfClass:NSString.class]||![old[@"role"]length]||![fresh[@"role"]length])return NO;
  for(NSString *key in @[@"role",@"subrole",@"role_description",@"title",@"description",@"value",@"value_description",@"placeholder",@"help",@"identifier",@"url"]){if(ignoreValueChange&&[key isEqual:@"value"])continue;if(![old[key]isEqual:fresh[key]])return NO;}
  return YES;
}
static NSArray<CUAXNode *> *CUAXRefetchCandidates(CUAXRevision *source,CUElement *observed) {
  NSMutableArray *out=[NSMutableArray new];for(CUAXNode *node in source.sources)if(!CUAXReferenceIsRetired(node.element)&&[node.element.identifier isEqual:observed.identifier]&&CFEqual(node.element.ax,observed.ax))[out addObject:node];return out;
}
BOOL CURecordedAXTitle(CUWindow *target,AXUIElementRef element,NSString **title) {
  if(title)*title=nil;CUAXRevision *source=CUAXRecordedRevision(target,YES)?:CUAXRecordedRevision(target,NO);
  for(CUAXNode *node in source.sources)if(CFEqual(node.element.ax,element)){id value=node.signature[@"title"];if(title&&[value isKindOfClass:NSString.class])*title=value;return YES;}return NO;
}
static BOOL CUAXUniqueTextRange(NSString *source,NSString *text,NSString *prefix,NSString *suffix,NSRange *range) {
  if(!source.length||!text.length)return NO;NSUInteger count=0,cursor=0;NSRange unique=NSMakeRange(NSNotFound,0);
  while(cursor<source.length){NSRange match=[source rangeOfString:text options:0 range:NSMakeRange(cursor,source.length-cursor)];if(match.location==NSNotFound)break;
    BOOL accepted=YES;if(prefix){accepted=match.location>=prefix.length&&CUAXStringsEqual([source substringWithRange:NSMakeRange(match.location-prefix.length,prefix.length)],prefix);}
    if(accepted&&suffix){NSUInteger end=NSMaxRange(match);accepted=suffix.length<=source.length-end&&CUAXStringsEqual([source substringWithRange:NSMakeRange(end,suffix.length)],suffix);}
    if(accepted){unique=match;if(++count>1)return NO;}cursor=match.location+1;
  }if(count!=1)return NO;if(range)*range=unique;return YES;
}
static BOOL CUAXMappedSourceRange(CUAXNode *node,NSString *text,NSString *prefix,NSString *suffix,NSRange *range) {
  if(!node.valueSourceOffsets)return NO;NSRange match;if(!CUAXUniqueTextRange(CUAXStringAttribute(node,@"value"),text,prefix,suffix,&match)||NSMaxRange(match)>node.valueSourceOffsets.count)return NO;
  NSNumber *first=nil,*last=nil;for(NSUInteger i=match.location;i<NSMaxRange(match);i++){id offset=node.valueSourceOffsets[i];if([offset isKindOfClass:NSNumber.class]){if(!first)first=offset;last=offset;}}
  if(!first||last.unsignedIntegerValue<first.unsignedIntegerValue||last.unsignedIntegerValue==NSUIntegerMax)return NO;if(range)*range=NSMakeRange(first.unsignedIntegerValue,last.unsignedIntegerValue-first.unsignedIntegerValue+1);return YES;
}
BOOL CURecordedSourceTextRange(CUWindow *target,AXUIElementRef element,NSString *text,NSString *prefix,NSString *suffix,NSRange *range) {
  if(range)*range=NSMakeRange(NSNotFound,0);CUAXRevision *source=CUAXRecordedRevision(target,YES)?:CUAXRecordedRevision(target,NO);CUAXNode *record=nil;
  for(NSArray<CUAXNode *> *nodes in @[source.renders?:@[],source.focusRenders?:@[],source.sources?:@[]]){for(CUAXNode *node in nodes)if(CFEqual(node.element.ax,element)){record=node;break;}if(record)break;}
  if(!record)return NO;NSRange match;BOOL found=CUAXMappedSourceRange(record,text,prefix,suffix,&match);
  if(!found&&record.attributedValue)found=CUAXUniqueTextRange(record.attributedValue.string,text,prefix,suffix,&match);
  if(!found&&!record.attributedValue){id raw=record.signature[@"value"];if(raw&&raw!=NSNull.null&&CFGetTypeID((__bridge CFTypeRef)raw)==CFBooleanGetTypeID())return NO;id value=record.sourceAttributes[@"value"];if([value isKindOfClass:NSString.class])found=CUAXUniqueTextRange(value,text,prefix,suffix,&match);}
  if(!found)return NO;NSUInteger offset=record.truncationRange?record.truncationRange.rangeValue.location:0;if(offset>NSIntegerMax||match.location>(NSUInteger)NSIntegerMax-offset)return NO;match.location+=offset;if(range)*range=match;return YES;
}
static void CUAXValidateTarget(CUWindow *target,CUElement *element,BOOL validateElement) {
  if(CUAXReferenceIsRetired(element))CUFail(@"STALE_ELEMENT",@"The accessibility element reference is stale; read the current window state.");
  pid_t pid=0;if(AXUIElementGetPid(element.ax,&pid)!=kAXErrorSuccess||pid!=target.pid)CUFail(@"STALE_ELEMENT",@"The element no longer belongs to the selected process.");
  id window=CUAX(element.ax,kAXWindowAttribute);if(window&&CFGetTypeID((__bridge CFTypeRef)window)==AXUIElementGetTypeID()&&CUAXWindowId((__bridge AXUIElementRef)window)!=target.windowId)CUFail(@"WRONG_WINDOW",@"The element moved to another window.");
  if(validateElement&&!CUAX(element.ax,kAXRoleAttribute))CUFail(@"STALE_ELEMENT",@"The refetched accessibility element is no longer available.");
}
CUElement *CURefetchRecordedElement(CUSession *session,CUWindow *target,CUElement *observed,BOOL validateElement,BOOL ignoreValueChange) {
  [session check];NSDictionary *signature=objc_getAssociatedObject(observed,&CUAXSignatureKey);
  if(CUAXReferenceIsRetired(observed))CUFail(@"STALE_ELEMENT",@"The accessibility element reference is stale; read the current window state.");
  if(!signature)CUFail(@"STALE_ELEMENT",@"Read the current window state before acting on this element.");
  CUAXRevision *source=CUAXRecordedRevision(target,YES)?:CUAXRecordedRevision(target,NO);
  NSArray<CUAXNode *> *previous=CUAXRefetchCandidates(source,observed);
  if(!previous.count)CUFail(@"STALE_ELEMENT",@"The accessibility element reference is stale; it is absent from the recorded source tree.");
  if(previous.count!=1)CUFail(@"AMBIGUOUS_ELEMENT",@"Multiple source records refer to the observed accessibility object.");
  CUAXRevision *published=CUAXRecordedRevision(target,NO);NSMutableDictionary *args=[published.captureArguments mutableCopy]?:[NSMutableDictionary new];
  args[@"pid"]=@(target.pid);args[@"window_id"]=@(target.windowId);args[@"include_accessibility_tree"]=@YES;args[@"include_screenshot"]=@NO;args[@"refetch_only"]=@YES;
  args[@"prefetch_enabled"]=@NO;
  // Without an invalidation monitor, a live role/signature alone cannot prove
  // membership. Read full child arrays rather than a bounded prefetch subset.
  NSDictionary *capture=CUObserve(session,args)[@"structuredContent"];
  if([capture[@"truncated"]boolValue]||[capture[@"unreadable"]boolValue]||capture[@"degraded_reason"])CUFail(@"REFETCH_INCOMPLETE",@"The refreshed source tree is incomplete; the element cannot be uniquely validated.");
  source=CUAXRecordedRevision(target,YES);NSArray<CUAXNode *> *matches=CUAXRefetchCandidates(source,observed);
  if(!matches.count)CUFail(@"STALE_ELEMENT",@"The accessibility element reference is stale; its source object is no longer present.");
  if(matches.count!=1)CUFail(@"AMBIGUOUS_ELEMENT",@"Multiple source records refer to the observed accessibility object.");
  if(!CUAXSignatureMatches(signature,matches[0].signature,ignoreValueChange))CUFail(@"STALE_ELEMENT",@"The accessibility element reference is stale; its recorded attributes changed.");
  CUElement *current=matches[0].element;CUAXValidateTarget(target,current,validateElement);
  return current;
}
