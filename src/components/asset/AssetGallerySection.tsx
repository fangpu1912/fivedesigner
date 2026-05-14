import type { ReactNode } from 'react'

interface AssetGallerySectionProps {
  title: string
  count: number
  icon?: ReactNode
  children: ReactNode
}

export function AssetGallerySection({ title, count, icon, children }: AssetGallerySectionProps) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        {icon}
        {title} ({count})
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">{children}</div>
    </section>
  )
}
