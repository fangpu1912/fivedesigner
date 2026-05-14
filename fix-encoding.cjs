const fs = require('fs');
const path = 'd:/trae_projects/fivedesigner/src/pages/StoryboardDraw.tsx';
let content = fs.readFileSync(path, 'utf8');

// Find and replace remaining garbled text
const replacements = [
  {"from": "鍦ㄥ彸渚ч厤缃€弬鏁板苟鐢熸垚", "to": "在右侧配置参数并生成"},
  {"from": "鐢熸垚鎻愮ず璇?", "to": "生成提示词"},
  {"from": "鍙傝€冨浘锛氫綔涓洪€?鍐呭?鍙傝€冿紝杈呭姪鐢熸垚", "to": "参考图：作为首帧/内容参考，辅助生成"},
];

let count = 0;
for (const r of replacements) {
  if (content.includes(r.from)) {
    const regex = new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    content = content.replace(regex, r.to);
    count++;
    console.log("Replaced: " + r.from.substring(0, 20) + "... -> " + r.to);
  }
}

if (count > 0) {
  fs.writeFileSync(path, content, "utf8");
  console.log("\nDone! Replaced " + count + " patterns.");
} else {
  console.log("No more garbled text found.");
}
