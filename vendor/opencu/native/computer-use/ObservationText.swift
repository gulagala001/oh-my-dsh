private func sourceString(_ pointer: UnsafePointer<UInt16>?, _ length: Int64) -> String {
    String(decoding: UnsafeBufferPointer(start: pointer, count: Int(length)), as: UTF16.self)
}

@_cdecl("CUObservationFirstCharacterIsNumber")
func cuObservationFirstCharacterIsNumber(_ pointer: UnsafePointer<UInt16>?, _ length: Int64) -> Int32 {
    sourceString(pointer, length).first?.isNumber == true ? 1 : 0
}

@_cdecl("CUObservationCharacterCount")
func cuObservationCharacterCount(_ pointer: UnsafePointer<UInt16>?, _ length: Int64) -> Int64 {
    Int64(sourceString(pointer, length).count)
}

@_cdecl("CUObservationPrefixUTF16Length")
func cuObservationPrefixUTF16Length(_ pointer: UnsafePointer<UInt16>?, _ length: Int64, _ count: Int64) -> Int64 {
    Int64(sourceString(pointer, length).prefix(Int(count)).utf16.count)
}

@_cdecl("CUObservationCharacterIsLF")
func cuObservationCharacterIsLF(_ pointer: UnsafePointer<UInt16>?, _ length: Int64, _ last: Int32) -> Int32 {
    let string = sourceString(pointer, length)
    return (last == 0 ? string.first : string.last) == "\n" ? 1 : 0
}

@_cdecl("CUObservationStringsEqual")
func cuObservationStringsEqual(_ left: UnsafePointer<UInt16>?, _ leftLength: Int64,
                               _ right: UnsafePointer<UInt16>?, _ rightLength: Int64) -> Int32 {
    sourceString(left, leftLength) == sourceString(right, rightLength) ? 1 : 0
}
