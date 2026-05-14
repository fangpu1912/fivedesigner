import React from 'react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  className,
}) => {
  // 将 HTML 内容转换为纯文本/Markdown
  const cleanContent = content
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n')
    .replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n')
    .replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
    .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
    .replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~')
    .replace(/<del>(.*?)<\/del>/gi, '~~$1~~')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/gis, '```\n$1\n```')
    .replace(/<blockquote>(.*?)<\/blockquote>/gis, '> $1\n')
    .replace(/<ul>(.*?)<\/ul>/gis, '$1')
    .replace(/<ol>(.*?)<\/ol>/gis, '$1')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<div>(.*?)<\/div>/gi, '$1\n')
    .replace(/<span[^>]*>(.*?)<\/span>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert p-4 overflow-y-auto h-full',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent || '暂无内容'}</ReactMarkdown>
    </div>
  )
}

export default MarkdownPreview
