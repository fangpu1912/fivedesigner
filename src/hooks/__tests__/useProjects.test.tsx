import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { projectDB } from '@/db'

import {
  useProjectsQuery,
  useProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  projectKeys,
} from '../useProjects'

vi.mock('@/db', () => ({
  projectDB: {
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

describe('projectKeys', () => {
  it('should generate correct query keys', () => {
    expect(projectKeys.all).toEqual(['projects'])
    expect(projectKeys.lists()).toEqual(['projects', 'list'])
    expect(projectKeys.list('filter')).toEqual(['projects', 'list', { filters: 'filter' }])
    expect(projectKeys.details()).toEqual(['projects', 'detail'])
    expect(projectKeys.detail('123')).toEqual(['projects', 'detail', '123'])
  })
})

describe('useProjectsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch all projects', async () => {
    const mockProjects = [
      { id: '1', name: 'Project 1', created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: '2', name: 'Project 2', created_at: '2024-01-01', updated_at: '2024-01-01' },
    ]
    vi.mocked(projectDB.getAll).mockResolvedValue(mockProjects)

    const { result } = renderHook(() => useProjectsQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockProjects)
    expect(projectDB.getAll).toHaveBeenCalledTimes(1)
  })
})

describe('useProjectQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch single project by id', async () => {
    const mockProject = {
      id: '1',
      name: 'Project 1',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    }
    vi.mocked(projectDB.getById).mockResolvedValue(mockProject)

    const { result } = renderHook(() => useProjectQuery('1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockProject)
    expect(projectDB.getById).toHaveBeenCalledWith('1')
  })

  it('should not fetch when id is empty', () => {
    renderHook(() => useProjectQuery(''), {
      wrapper: createWrapper(),
    })

    expect(projectDB.getById).not.toHaveBeenCalled()
  })
})

describe('useCreateProjectMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create project', async () => {
    const newProject = { name: 'New Project', description: 'Description' }
    const createdProject = { id: '1', ...newProject, created_at: '', updated_at: '' }
    vi.mocked(projectDB.create).mockResolvedValue(createdProject)

    const { result } = renderHook(() => useCreateProjectMutation(), {
      wrapper: createWrapper(),
    })

    result.current.mutate(newProject)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(projectDB.create).toHaveBeenCalledWith(newProject)
  })
})

describe('useUpdateProjectMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update project', async () => {
    const updateData = { name: 'Updated Project' }
    const updatedProject = {
      id: '1',
      name: 'Updated Project',
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    }
    vi.mocked(projectDB.update).mockResolvedValue(updatedProject)

    const { result } = renderHook(() => useUpdateProjectMutation(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ id: '1', data: updateData })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(projectDB.update).toHaveBeenCalledWith('1', updateData)
  })
})

describe('useDeleteProjectMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete project', async () => {
    vi.mocked(projectDB.delete).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteProjectMutation(), {
      wrapper: createWrapper(),
    })

    result.current.mutate('1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(projectDB.delete).toHaveBeenCalledWith('1')
  })
})
