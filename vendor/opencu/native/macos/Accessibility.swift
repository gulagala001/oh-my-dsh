import Foundation
import AppKit
import ApplicationServices

struct ElementRecord {
    let element: AXUIElement
    let targetId: String
    let generation: Int
}

private func accessibilityTextValues(title: String?, description: String?, help: String?) -> [String: String] {
    func nonempty(_ value: String?) -> String? {
        guard let value = value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value
    }
    let description = nonempty(description), help = nonempty(help)
    var result = ["name": nonempty(title) ?? description ?? ""]
    if let description = description { result["description"] = description }
    if let help = help { result["help"] = help }
    return result
}

private func accessibilityText(_ element: AXUIElement) -> [String: String] {
    accessibilityTextValues(title: axString(element, kAXTitleAttribute),
        description: axString(element, kAXDescriptionAttribute), help: axString(element, kAXHelpAttribute))
}

final class AccessibilityStore {
    var elements: [Int: ElementRecord] = [:]
    var nextID = 1
    var generation = 0
    private let identityScope = UUID().uuidString

    func observe(_ target: [String: Any], targets: TargetStore, options: [String: Any]) throws -> [String: Any] {
        try requireAX()
        let root = target["windowId"] == nil ? AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0)) : try targets.axWindow(target)
        let id = target["id"] as? String ?? ""
        generation += 1
        let previous = Dictionary(grouping: elements.filter { $0.value.targetId == id }, by: { CFHash($0.value.element) })
        elements = elements.filter { $0.value.targetId != id }
        let current = generation
        let maxNodes = min(3000, max(1, options["maxNodes"] as? Int ?? 1000))
        let maxDepth = min(80, max(1, options["maxDepth"] as? Int ?? 40))
        let deadline = Date(timeIntervalSinceNow: min(15, max(0.1, (options["timeoutMs"] as? Double ?? 5000) / 1000)))
        AXUIElementSetMessagingTimeout(AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0)), 0.5)
        var lines: [String] = [], nodes: [[String: Any]] = [], visited: [CFHashCode: [AXUIElement]] = [:]
        var truncated = false
        func visit(_ element: AXUIElement, depth: Int, parentID: Int?) {
            if nodes.count >= maxNodes || depth > maxDepth || Date() > deadline { truncated = true; return }
            let hash = CFHash(element)
            if visited[hash]?.contains(where: { CFEqual($0, element) }) == true { return }
            visited[hash, default: []].append(element)
            let numericID: Int
            if let old = previous[hash]?.first(where: { CFEqual($0.value.element, element) }) { numericID = old.key }
            else { numericID = nextID; nextID += 1 }
            elements[numericID] = ElementRecord(element: element, targetId: id, generation: current)
            let role = axString(element, kAXRoleAttribute) ?? "AXUnknown"
            let text = accessibilityText(element), name = text["name"] ?? ""
            var node: [String: Any] = ["id": numericID, "elementId": numericID, "role": role]
            for (key, value) in text { node[key] = value }
            if let parentID = parentID { node["parentId"] = parentID }
            if !name.isEmpty { node["label"] = name }
            if let value = attribute(element, kAXValueAttribute) {
                if let text = value as? String { node["value"] = String(text.prefix(8000)) }
                else if let number = value as? NSNumber { node["value"] = number }
            }
            for name in [kAXEnabledAttribute, kAXFocusedAttribute, kAXSelectedAttribute] {
                if let value = attribute(element, name) as? NSNumber { node[name] = value }
            }
            if let rect = axRect(element) { node["bounds"] = rectJSON(rect) }
            var settable = DarwinBoolean(false)
            if AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success { node["valueSettable"] = settable.boolValue }
            if [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole].contains(role) {
                for (name, key) in [(kAXSelectedTextAttribute, "selectedTextSettable"), (kAXSelectedTextRangeAttribute, "selectedTextRangeSettable")] {
                    var writable = DarwinBoolean(false)
                    if AXUIElementIsAttributeSettable(element, name as CFString, &writable) == .success { node[key] = writable.boolValue }
                }
                if let range = selectedRange(element) { node["selectedTextRange"] = ["location": range.location, "length": range.length] }
            }
            var actions: CFArray?
            if AXUIElementCopyActionNames(element, &actions) == .success, let names = actions as? [String] { node["actions"] = names }
            nodes.append(node)
            let label = name.replacingOccurrences(of: "\n", with: " ")
            let supplementary = ["description", "help"].compactMap { key -> String? in
                guard let value = text[key], value != name, key != "help" || value != text["description"] else { return nil }
                return " \(key)=\(value.replacingOccurrences(of: "\n", with: " "))"
            }.joined()
            let value = node["value"].map { " value=\(String(describing: $0).prefix(500))" } ?? ""
            lines.append(String(repeating: "  ", count: depth) + "[\(numericID)] \(role) \(label)\(supplementary)\(value)")
            for child in axElements(element, kAXChildrenAttribute) { visit(child, depth: depth + 1, parentID: numericID) }
        }
        visit(root, depth: 0, parentID: nil)
        return ["text": lines.joined(separator: "\n"), "nodes": nodes, "generation": current, "truncated": truncated,
                "stableIds": true, "identityScope": identityScope + ":" + id,
                "numericIds": "stable while the same element remains in this target; removed elements and helper restart invalidate IDs"]
    }

    func get(_ id: Int, target: [String: Any]) throws -> AXUIElement {
        guard let record = elements[id], record.targetId == target["id"] as? String else {
            throw NativeFailure("STALE_ELEMENT", "The numeric AX ID is not present in the latest observation of this target.", ["elementId": id])
        }
        var pid: pid_t = 0
        try checkedAX(AXUIElementGetPid(record.element, &pid), "verify element process")
        guard Int(pid) == target["pid"] as? Int else { throw NativeFailure("TARGET_IDENTITY_CHANGED", "Element belongs to a different process.") }
        // A destroyed AX element fails this live read, even when its process is still running.
        var role: CFTypeRef?
        try checkedAX(AXUIElementCopyAttributeValue(record.element, kAXRoleAttribute as CFString, &role), "verify element")
        return record.element
    }

    func hitTest(_ point: CGPoint, target: [String: Any], targets: TargetStore) throws -> [String: Any] {
        try requireAX()
        let root = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
        var hit: AXUIElement?
        try checkedAX(AXUIElementCopyElementAtPosition(root, Float(point.x), Float(point.y), &hit), "hit test element")
        guard let element = hit else { throw NativeFailure("ELEMENT_NOT_FOUND", "No accessibility element at this screenshot point.") }
        var pid: pid_t = 0
        try checkedAX(AXUIElementGetPid(element, &pid), "verify hit process")
        guard Int(pid) == target["pid"] as? Int else { throw NativeFailure("TARGET_IDENTITY_CHANGED", "Hit element belongs to another application.") }
        try verifyWindow(element, target: target, targets: targets)
        let numericID = nextID; nextID += 1
        elements[numericID] = ElementRecord(element: element, targetId: target["id"] as? String ?? "", generation: generation)
        var result: [String: Any] = ["kind": "element", "elementId": numericID, "runtimeElementId": numericID,
            "role": axString(element, kAXRoleAttribute) ?? "AXUnknown"]
        for (key, value) in accessibilityText(element) { result[key] = value }
        if let rect = axRect(element) { result["bounds"] = rectJSON(rect) }
        return result
    }

    func setValue(_ id: Int, target: [String: Any], value: Any) throws {
        try requireAX()
        let element = try get(id, target: target)
        var settable = DarwinBoolean(false)
        try checkedAX(AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable), "check value is settable")
        guard settable.boolValue else { throw NativeFailure("AX_VALUE_NOT_SETTABLE", "The selected element does not support AX value assignment.") }
        try checkedAX(AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef), "set value")
    }

    func press(_ id: Int, target: [String: Any]) throws {
        try requireAX()
        try checkedAX(AXUIElementPerformAction(try get(id, target: target), kAXPressAction as CFString), "press element")
    }

    private func selectedRange(_ element: AXUIElement) -> CFRange? {
        guard let raw = attribute(element, kAXSelectedTextRangeAttribute), CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
        let value = unsafeBitCast(raw, to: AXValue.self)
        guard AXValueGetType(value) == .cfRange else { return nil }
        var range = CFRange()
        return AXValueGetValue(value, .cfRange, &range) ? range : nil
    }

    private func writable(_ element: AXUIElement, _ name: String) throws {
        var settable = DarwinBoolean(false)
        guard AXUIElementIsAttributeSettable(element, name as CFString, &settable) == .success, settable.boolValue else {
            throw NativeFailure("ELEMENT_NOT_EDITABLE", "The selected element does not expose writable \(name); no input was sent.")
        }
    }

    private func textAvailable(_ element: AXUIElement, editing: Bool = false) throws {
        guard (attribute(element, kAXEnabledAttribute) as? NSNumber)?.boolValue != false,
              axString(element, kAXSubroleAttribute) != "AXSecureTextField",
              (attribute(element, "AXProtectedContent") as? NSNumber)?.boolValue != true else {
            throw NativeFailure("ELEMENT_NOT_EDITABLE", "Disabled or protected text elements cannot be edited or selected through this API; no input was sent.")
        }
        if editing && ((attribute(element, "AXReadOnly") as? NSNumber)?.boolValue == true || (attribute(element, "AXEditable") as? NSNumber)?.boolValue == false) {
            throw NativeFailure("ELEMENT_NOT_EDITABLE", "The selected text element is read-only; no input was sent.")
        }
    }

    private func currentElement(_ id: Int?, target: [String: Any], targets: TargetStore) throws -> AXUIElement {
        _ = try targets.validated(target)
        let element: AXUIElement
        if let id = id { element = try get(id, target: target) }
        else {
            let root = AXUIElementCreateApplication(pid_t(target["pid"] as? Int ?? 0))
            guard let focused = attribute(root, kAXFocusedUIElementAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() else {
                throw NativeFailure("ELEMENT_NOT_EDITABLE", "The selected application has no focused accessibility editor; no input was sent.")
            }
            element = unsafeBitCast(focused, to: AXUIElement.self)
            var pid: pid_t = 0
            try checkedAX(AXUIElementGetPid(element, &pid), "verify focused editor process")
            guard Int(pid) == target["pid"] as? Int else { throw NativeFailure("TARGET_IDENTITY_CHANGED", "Focused editor belongs to a different application.") }
        }
        try verifyWindow(element, target: target, targets: targets)
        return element
    }

    func selectText(_ id: Int, target: [String: Any], targets: TargetStore, action: [String: Any], check: () throws -> Void, willDispatch: () -> Void) throws {
        try requireAX()
        let selectionType = action["selectionType"] as? String ?? "text"
        guard let text = action["text"] as? String, !text.isEmpty,
              action["prefix"] == nil || action["prefix"] is String,
              action["suffix"] == nil || action["suffix"] is String,
              action["selectionType"] == nil || action["selectionType"] is String,
              ["text", "cursor_before", "cursor_after"].contains(selectionType) else {
            throw NativeFailure("INVALID_ARGUMENT", "selectText requires non-empty text, optional string prefix/suffix and text/cursor_before/cursor_after selectionType.")
        }
        let element = try currentElement(id, target: target, targets: targets)
        try textAvailable(element)
        try writable(element, kAXSelectedTextRangeAttribute)
        guard let value = axString(element, kAXValueAttribute) else { throw NativeFailure("ELEMENT_NOT_EDITABLE", "The selected element has no complete string AXValue to search; no input was sent.") }
        let source = value as NSString, needle = text as NSString
        let prefix = (action["prefix"] as? String ?? "") as NSString, suffix = (action["suffix"] as? String ?? "") as NSString
        var offset = 0, matches: [NSRange] = []
        while offset <= source.length {
            try check()
            let found = source.range(of: text, options: .literal, range: NSRange(location: offset, length: source.length - offset))
            if found.location == NSNotFound { break }
            let end = found.location + found.length
            if found.location >= prefix.length, end + suffix.length <= source.length,
               source.compare(prefix as String, options: .literal, range: NSRange(location: found.location - prefix.length, length: prefix.length)) == .orderedSame,
               source.compare(suffix as String, options: .literal, range: NSRange(location: end, length: suffix.length)) == .orderedSame {
                matches.append(found)
                if matches.count > 1 { break }
            }
            // NSString ranges and AXSelectedTextRange both use UTF-16 units.
            // Advance one unit so overlapping matches are not accidentally unique.
            offset = found.location + 1
        }
        guard let match = matches.first else { throw NativeFailure("TEXT_NOT_FOUND", "No exact text match with the supplied adjacent context was found; no input was sent.") }
        guard matches.count == 1 else { throw NativeFailure("AMBIGUOUS_TEXT", "More than one exact text match remains; supply prefix/suffix context. No input was sent.") }
        var range = CFRange(location: selectionType == "cursor_after" ? match.location + needle.length : match.location,
            length: selectionType == "text" ? match.length : 0)
        guard let selected = AXValueCreate(.cfRange, &range) else { throw NativeFailure("UNSUPPORTED_ACTION", "Could not create an accessibility text range; no input was sent.") }
        try check()
        let live = try currentElement(id, target: target, targets: targets)
        guard CFEqual(element, live), let current = axString(live, kAXValueAttribute), source.compare(current, options: .literal) == .orderedSame else {
            throw NativeFailure("STALE_ELEMENT", "The selected text source changed before selection; observe again. No input was sent.")
        }
        try textAvailable(live)
        try writable(live, kAXSelectedTextRangeAttribute)
        try check(); willDispatch()
        try checkedAX(AXUIElementSetAttributeValue(live, kAXSelectedTextRangeAttribute as CFString, selected), "select text range")
    }

    func paste(_ id: Int?, target: [String: Any], targets: TargetStore, text: String, check: () throws -> Void, willDispatch: () -> Void) throws {
        try requireAX()
        let element = try currentElement(id, target: target, targets: targets)
        try textAvailable(element, editing: true)
        try writable(element, kAXSelectedTextAttribute)
        let source = axString(element, kAXValueAttribute), range = selectedRange(element)
        try check()
        let live = try currentElement(id, target: target, targets: targets)
        guard CFEqual(element, live) else { throw NativeFailure("STALE_ELEMENT", "The focused editor changed before insertion; observe again. No input was sent.") }
        if let source = source {
            guard let value = axString(live, kAXValueAttribute), (source as NSString).compare(value, options: .literal) == .orderedSame else {
                throw NativeFailure("STALE_ELEMENT", "The editor text changed before insertion; observe again. No input was sent.")
            }
        }
        if let range = range {
            guard let current = selectedRange(live), current.location == range.location, current.length == range.length else {
                throw NativeFailure("STALE_ELEMENT", "The editor selection changed before insertion; observe again. No input was sent.")
            }
        }
        try textAvailable(live, editing: true)
        try writable(live, kAXSelectedTextAttribute)
        try check(); willDispatch()
        // The application's selected-text setter owns replacement and undo.
        // Never rewrite AXValue, focus a window, or modify the system clipboard.
        try checkedAX(AXUIElementSetAttributeValue(live, kAXSelectedTextAttribute as CFString, text as CFString), "insert selected text")
    }

    func performSecondaryAction(_ id: Int, target: [String: Any], targets: TargetStore, name: String, check: () throws -> Void, willDispatch: () -> Void) throws {
        try requireAX()
        let aliases = ["Increment": "AXIncrement", "Decrement": "AXDecrement", "ShowMenu": "AXShowMenu", "Confirm": "AXConfirm", "Cancel": "AXCancel", "Raise": "AXRaise", "Pick": "AXPick", "Press": "AXPress"]
        let action = aliases[name] ?? name
        try check()
        let element = try currentElement(id, target: target, targets: targets)
        guard (attribute(element, kAXEnabledAttribute) as? NSNumber)?.boolValue != false else {
            throw NativeFailure("ELEMENT_DISABLED", "The selected control is disabled; no input was sent.")
        }
        var names: CFArray?
        try checkedAX(AXUIElementCopyActionNames(element, &names), "read current element actions")
        let available = names as? [String] ?? []
        guard available.contains(action) else {
            throw NativeFailure("UNSUPPORTED_ACTION", "The selected element does not currently support \(action); no input was sent.", ["requestedAction": name, "resolvedAction": action, "availableActions": available])
        }
        try check()
        let live = try currentElement(id, target: target, targets: targets)
        guard CFEqual(element, live) else { throw NativeFailure("STALE_ELEMENT", "The selected action element changed; observe again. No input was sent.") }
        // Re-read capabilities immediately before dispatch; action order has no meaning.
        var liveNames: CFArray?
        try checkedAX(AXUIElementCopyActionNames(live, &liveNames), "verify current element actions")
        guard (attribute(live, kAXEnabledAttribute) as? NSNumber)?.boolValue != false else { throw NativeFailure("ELEMENT_DISABLED", "The selected control became disabled; no input was sent.") }
        guard (liveNames as? [String] ?? []).contains(action) else { throw NativeFailure("UNSUPPORTED_ACTION", "The requested accessibility action is no longer available; no input was sent.") }
        try check(); willDispatch()
        try checkedAX(AXUIElementPerformAction(live, action as CFString), "perform \(action)")
    }

    func verifyWindow(_ element: AXUIElement, target: [String: Any], targets: TargetStore) throws {
        guard target["windowId"] != nil else { return }
        let window = try targets.axWindow(target)
        var node = element
        for _ in 0..<80 {
            if CFEqual(node, window) { return }
            guard let parent = attribute(node, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            node = unsafeBitCast(parent, to: AXUIElement.self)
        }
        throw NativeFailure("TARGET_IDENTITY_CHANGED", "The selected element is outside the target window.")
    }

    func pressable(_ id: Int, target: [String: Any], targets: TargetStore) throws -> AXUIElement? {
        try requireAX()
        let element = try get(id, target: target)
        try verifyWindow(element, target: target, targets: targets)
        var node = element
        for _ in 0..<80 {
            let role = axString(node, kAXRoleAttribute) ?? ""
            if [kAXRowRole, kAXWindowRole, kAXApplicationRole].contains(role) { return nil }
            if [kAXButtonRole, kAXCheckBoxRole, kAXRadioButtonRole, kAXPopUpButtonRole, kAXMenuButtonRole, "AXLink"].contains(role) {
                guard (attribute(node, kAXEnabledAttribute) as? NSNumber)?.boolValue != false else {
                    throw NativeFailure("ELEMENT_DISABLED", "The selected control is disabled; no input was sent.")
                }
                var actions: CFArray?
                try checkedAX(AXUIElementCopyActionNames(node, &actions), "read element actions")
                return (actions as? [String] ?? []).contains(kAXPressAction) ? node : nil
            }
            guard let parent = attribute(node, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { return nil }
            node = unsafeBitCast(parent, to: AXUIElement.self)
        }
        return nil
    }

    func selectableRow(_ id: Int, target: [String: Any], targets: TargetStore) throws -> AXUIElement? {
        let element = try get(id, target: target)
        guard [kAXRowRole, kAXCellRole, kAXStaticTextRole].contains(axString(element, kAXRoleAttribute) ?? "") else { return nil }
        let window = try targets.axWindow(target)
        var node = element, row: AXUIElement?
        for _ in 0..<80 {
            if CFEqual(node, window) {
                guard let row = row else { return nil }
                var settable = DarwinBoolean(false)
                try checkedAX(AXUIElementIsAttributeSettable(row, kAXSelectedAttribute as CFString, &settable), "check row selection is settable")
                guard settable.boolValue else { throw NativeFailure("BACKGROUND_SELECTION_UNAVAILABLE", "The selected row does not support background AX selection; no pointer input was sent.") }
                return row
            }
            if row == nil && axString(node, kAXRoleAttribute) == kAXRowRole { row = node }
            guard let parent = attribute(node, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            node = unsafeBitCast(parent, to: AXUIElement.self)
        }
        throw NativeFailure("TARGET_IDENTITY_CHANGED", "The selected row is outside the target window.")
    }

    func center(_ id: Int, target: [String: Any]) throws -> CGPoint {
        try requireAX()
        guard let bounds = axRect(try get(id, target: target)), bounds.width > 0, bounds.height > 0 else {
            throw NativeFailure("ELEMENT_NOT_VISIBLE", "AX element has no usable screen bounds.")
        }
        return CGPoint(x: bounds.midX, y: bounds.midY)
    }
}
