import AppKit
import Foundation

let width = 1920
let height = 1080
let fps = 30
let duration = 8.0
let charWidth = 25.3
let lineHeight = 68.0
let maxColumns = 66
let textTop = 350.0

struct Input: Decodable { let source: String; let target: String }
struct Point { let x: Double; let y: Double }
struct Match { let sourceIndex: Int; let targetIndex: Int; let order: Int }

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let input = try JSONDecoder().decode(Input.self, from: Data(contentsOf: root.appendingPathComponent("anagram.json")))
let sourceChars = Array(input.source)
let targetChars = Array(input.target)

func isLetter(_ ch: Character) -> Bool {
    ch.unicodeScalars.allSatisfy { CharacterSet.letters.contains($0) }
}

func folded(_ ch: Character) -> String { String(ch).lowercased() }

func layout(_ chars: [Character]) -> [Int: Point] {
    var words: [[(Int, Character)]] = []
    var word: [(Int, Character)] = []
    for (index, ch) in chars.enumerated() {
        word.append((index, ch))
        if ch == " " { words.append(word); word = [] }
    }
    if !word.isEmpty { words.append(word) }

    var lines: [[(Int, Character)]] = []
    var line: [(Int, Character)] = []
    for var next in words {
        if !line.isEmpty && line.count + next.count > maxColumns {
            while line.last?.1 == " " { line.removeLast() }
            lines.append(line)
            line = []
            while next.first?.1 == " " { next.removeFirst() }
        }
        line.append(contentsOf: next)
    }
    if !line.isEmpty { lines.append(line) }

    var result: [Int: Point] = [:]
    let blockHeight = Double(lines.count - 1) * lineHeight
    let y0 = textTop + (2.0 * lineHeight - blockHeight) / 2.0
    for (row, currentLine) in lines.enumerated() {
        let x0 = (Double(width) - Double(currentLine.count) * charWidth) / 2.0 + charWidth / 2.0
        for (column, item) in currentLine.enumerated() {
            result[item.0] = Point(x: x0 + Double(column) * charWidth, y: y0 + Double(row) * lineHeight)
        }
    }
    return result
}

let sourcePositions = layout(sourceChars)
let targetPositions = layout(targetChars)
var targetIndices: [String: [Int]] = [:]
for (index, ch) in targetChars.enumerated() where isLetter(ch) {
    targetIndices[folded(ch), default: []].append(index)
}
var used: [String: Int] = [:]
var matches: [Match] = []
for (index, ch) in sourceChars.enumerated() where isLetter(ch) {
    let key = folded(ch)
    let occurrence = used[key, default: 0]
    guard let destination = targetIndices[key]?[occurrence] else {
        fatalError("Not an anagram")
    }
    matches.append(Match(sourceIndex: index, targetIndex: destination, order: matches.count))
    used[key] = occurrence + 1
}

let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bitmapFormat: [.alphaFirst],
    bytesPerRow: width * 4, bitsPerPixel: 32
)!
let graphics = NSGraphicsContext(bitmapImageRep: bitmap)!
let bodyFont = NSFont(name: "Menlo", size: 42)!
let titleFont = NSFont.systemFont(ofSize: 54, weight: .bold)
let labelFont = NSFont.systemFont(ofSize: 25, weight: .bold)
let noteFont = NSFont.systemFont(ofSize: 28, weight: .regular)
let badgeFont = NSFont.systemFont(ofSize: 28, weight: .semibold)

func clamp(_ value: Double, _ low: Double = 0, _ high: Double = 1) -> Double {
    min(high, max(low, value))
}

func fade(_ time: Double, start: Double, fadeIn: Double, end: Double, fadeOut: Double) -> Double {
    min(clamp((time - start) / fadeIn), clamp((end - time) / fadeOut))
}

func draw(_ text: String, x: Double, y: Double, font: NSFont, color: NSColor, alpha: Double = 1.0) {
    guard alpha > 0 else { return }
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color.withAlphaComponent(alpha)
    ]
    let attributed = NSAttributedString(string: text, attributes: attrs)
    let size = attributed.size()
    attributed.draw(at: NSPoint(x: x - size.width / 2.0, y: Double(height) - y - size.height / 2.0))
}

let white = NSColor(calibratedRed: 0.96, green: 0.97, blue: 1.0, alpha: 1)
let muted = NSColor(calibratedRed: 0.48, green: 0.56, blue: 0.69, alpha: 1)
let pale = NSColor(calibratedRed: 0.70, green: 0.79, blue: 0.92, alpha: 1)
let green = NSColor(calibratedRed: 0.22, green: 0.91, blue: 0.69, alpha: 1)
let background = NSColor(calibratedRed: 0.035, green: 0.067, blue: 0.12, alpha: 1)

for frame in 0..<(Int(duration) * fps) {
    autoreleasepool {
        let time = Double(frame) / Double(fps)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = graphics
        background.setFill()
        NSRect(x: 0, y: 0, width: width, height: height).fill()

        draw("Perfect anagram", x: 960, y: 90, font: titleFont, color: white)
        draw("Compared case-insensitively  •  spaces and punctuation excluded", x: 960, y: 998, font: noteFont, color: pale)

        let sourceLabelAlpha = fade(time, start: 0, fadeIn: 0.25, end: 2.25, fadeOut: 0.3)
        draw("SOURCE  •  103 LETTERS", x: 960, y: 245, font: labelFont, color: pale, alpha: sourceLabelAlpha)
        let targetLabelAlpha = fade(time, start: 5.4, fadeIn: 0.3, end: duration, fadeOut: 0.25)
        draw("TARGET  •  103 LETTERS", x: 960, y: 245, font: labelFont, color: pale, alpha: targetLabelAlpha)
        let badgeAlpha = fade(time, start: 5.55, fadeIn: 0.35, end: duration, fadeOut: 0.25)
        draw("✓  IDENTICAL LETTER COUNTS", x: 960, y: 930, font: badgeFont, color: green, alpha: badgeAlpha)

        let punctuationAlpha = fade(time, start: 0, fadeIn: 0.25, end: 2.3, fadeOut: 0.35)
        for (index, ch) in sourceChars.enumerated() where !isLetter(ch) && ch != " " {
            let p = sourcePositions[index]!
            draw(String(ch), x: p.x, y: p.y, font: bodyFont, color: muted, alpha: punctuationAlpha)
        }

        let movingAlpha = fade(time, start: 0.2, fadeIn: 0.25, end: 5.45, fadeOut: 0.3)
        for match in matches {
            let start = sourcePositions[match.sourceIndex]!
            let end = targetPositions[match.targetIndex]!
            let t1 = 2.1 + Double(match.order % 13) * 0.022
            let t2 = 5.0 + Double(match.order % 13) * 0.022
            var progress = clamp((time - t1) / (t2 - t1))
            progress = progress * progress * (3.0 - 2.0 * progress)
            let x = start.x + (end.x - start.x) * progress
            let y = start.y + (end.y - start.y) * progress
            draw(String(sourceChars[match.sourceIndex]), x: x, y: y, font: bodyFont, color: white, alpha: movingAlpha)
        }

        for (index, ch) in targetChars.enumerated() where ch != " " {
            let start = 5.05 + (isLetter(ch) ? 0 : Double(index % 7) * 0.025)
            let alpha = fade(time, start: start, fadeIn: 0.35, end: duration, fadeOut: 0.25)
            let p = targetPositions[index]!
            draw(String(ch), x: p.x, y: p.y, font: bodyFont, color: isLetter(ch) ? white : muted, alpha: alpha)
        }

        graphics.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        if let bytes = bitmap.bitmapData {
            FileHandle.standardOutput.write(Data(bytes: bytes, count: width * height * 4))
        }
    }
}
