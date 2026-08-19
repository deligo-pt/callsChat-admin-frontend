import { describe, expect, it } from 'vitest'

import { StatusBadge } from '@/components/display'
import { renderWithProviders, screen, setViewport } from '@tests/render'

import type { AdminColumn } from './columns'
import { DataList } from './DataList'

interface Row {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly diamonds: number
}

const ROWS: readonly Row[] = [
  { id: 'usr_1', name: 'Ayesha Rahman', status: 'ACTIVE', diamonds: 12480 },
  { id: 'usr_2', name: 'Marcus Feld', status: 'SUSPENDED', diamonds: 340 },
]

/** ONE definition, consumed by both renderers — the point of the abstraction. */
const COLUMNS: readonly AdminColumn<Row>[] = [
  { id: 'name', header: 'User', card: 'title', cell: (row) => row.name },
  {
    id: 'status',
    header: 'Status',
    card: 'status',
    cell: (row) => <StatusBadge domain="user" value={row.status} />,
  },
  {
    id: 'diamonds',
    header: 'Available',
    align: 'right',
    cell: (row) => String(row.diamonds),
  },
]

function renderList(
  width: number,
  props: Partial<Parameters<typeof DataList<Row>>[0]> = {},
) {
  setViewport(width)
  return renderWithProviders(
    <DataList rows={ROWS} columns={COLUMNS} rowKey={(row) => row.id} {...props} />,
  )
}

describe('DataList responsive swap', () => {
  it('renders a table at lg and above', () => {
    renderList(1440)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((el) => el.textContent)).toEqual([
      'User',
      'Status',
      'Available',
    ])
  })

  it('renders record cards below lg from the same column definition', () => {
    renderList(390)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Same data, different surface.
    expect(screen.getByText('Ayesha Rahman')).toBeInTheDocument()
    expect(screen.getByText('Marcus Feld')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows the same cell content in both surfaces', () => {
    const desktop = renderList(1440)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('12480')).toBeInTheDocument()
    desktop.unmount()

    renderList(390)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('12480')).toBeInTheDocument()
  })
})

describe('DataList remote states', () => {
  it('renders a loading skeleton', () => {
    renderList(1440, { loading: true })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders an empty state when there are no rows', () => {
    setViewport(1440)
    renderWithProviders(
      <DataList rows={[]} columns={COLUMNS} rowKey={(row: Row) => row.id} />,
    )
    expect(screen.getByText(/no records found/i)).toBeInTheDocument()
  })

  it('renders an error state with its correlation ID', () => {
    renderList(1440, {
      error: { message: 'Upstream timeout', correlationId: 'corr_abc123def456' },
    })
    expect(screen.getByText('Upstream timeout')).toBeInTheDocument()
    expect(screen.getByText(/corr_abc/)).toBeInTheDocument()
  })
})
