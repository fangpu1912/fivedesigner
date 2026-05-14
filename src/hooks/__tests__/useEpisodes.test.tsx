import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { episodeDB } from '@/db'

import {
  useEpisodesQuery,
  useEpisodeQuery,
  useCreateEpisodeMutation,
  useUpdateEpisodeMutation,
  useDeleteEpisodeMutation,
  episodeKeys,
} from '../useEpisodes'

vi.mock('@/db', () => ({
  episodeDB: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('episodeKeys', () => {
  it('should generate correct query keys', () => {
    expect(episodeKeys.all).toEqual(['episodes'])
    expect(episodeKeys.lists()).toEqual(['episodes', 'list'])
    expect(episodeKeys.list('project-1')).toEqual(['episodes', 'list', 'project-1'])
    expect(episodeKeys.details()).toEqual(['episodes', 'detail'])
    expect(episodeKeys.detail('123')).toEqual(['episodes', 'detail', '123'])
  })
})

describe('useEpisodesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch episodes by project id', async () => {
    const mockEpisodes = [
      {
        id: '1',
        name: 'Episode 1',
        project_id: 'project-1',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ]
    vi.mocked(episodeDB.getAll).mockResolvedValue(mockEpisodes)

    const { result } = renderHook(() => useEpisodesQuery('project-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockEpisodes)
    expect(episodeDB.getAll).toHaveBeenCalledWith('project-1')
  })

  it('should not fetch when project id is empty', () => {
    renderHook(() => useEpisodesQuery(''), {
      wrapper: createWrapper(),
    })

    expect(episodeDB.getAll).not.toHaveBeenCalled()
  })
})

describe('useEpisodeQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch single episode by id', async () => {
    const mockEpisode = {
      id: '1',
      name: 'Episode 1',
      project_id: 'project-1',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }
    vi.mocked(episodeDB.getById).mockResolvedValue(mockEpisode)

    const { result } = renderHook(() => useEpisodeQuery('1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockEpisode)
    expect(episodeDB.getById).toHaveBeenCalledWith('1')
  })

  it('should not fetch when id is empty', () => {
    renderHook(() => useEpisodeQuery(''), {
      wrapper: createWrapper(),
    })

    expect(episodeDB.getById).not.toHaveBeenCalled()
  })
})

describe('useCreateEpisodeMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create episode', async () => {
    const newEpisode = { name: 'New Episode', project_id: 'project-1', description: 'Description' }
    const createdEpisode = { id: '1', ...newEpisode, created_at: '', updated_at: '' }
    vi.mocked(episodeDB.create).mockResolvedValue(createdEpisode)

    const { result } = renderHook(() => useCreateEpisodeMutation(), {
      wrapper: createWrapper(),
    })

    result.current.mutate(newEpisode)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(episodeDB.create).toHaveBeenCalledWith(newEpisode)
  })
})

describe('useUpdateEpisodeMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update episode', async () => {
    const updateData = { name: 'Updated Episode' }
    const updatedEpisode = {
      id: '1',
      name: 'Updated Episode',
      project_id: 'project-1',
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    }
    vi.mocked(episodeDB.update).mockResolvedValue(updatedEpisode)

    const { result } = renderHook(() => useUpdateEpisodeMutation(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ id: '1', data: updateData })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(episodeDB.update).toHaveBeenCalledWith('1', updateData)
  })
})

describe('useDeleteEpisodeMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete episode', async () => {
    vi.mocked(episodeDB.delete).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteEpisodeMutation(), {
      wrapper: createWrapper(),
    })

    result.current.mutate('1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(episodeDB.delete).toHaveBeenCalledWith('1')
  })
})
