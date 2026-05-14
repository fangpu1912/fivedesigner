import codecs

f = codecs.open('d:/trae_projects/fivedesigner/src/pages/StoryboardDraw.tsx', 'r', 'utf-8')
lines = f.readlines()
f.close()

# Line 270 (index 269) - fix garbled comment
if '妫€鏌ユ暟鎹' in lines[269]:
    lines[269] = '    // 检查数据是否真的变化了（避免无限循环）\n'
    print('Fixed line 270')

# Line 1481 (index 1480) - fix garbled text
if '鍦ㄥ彸渚' in lines[1480]:
    lines[1480] = '                          <p className="text-sm mt-1">在右侧配置参数并生成</p>\n'
    print('Fixed line 1481')

f = codecs.open('d:/trae_projects/fivedesigner/src/pages/StoryboardDraw.tsx', 'w', 'utf-8')
f.writelines(lines)
f.close()

print('Done!')
