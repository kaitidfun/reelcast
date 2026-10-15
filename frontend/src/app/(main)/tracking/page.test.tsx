import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Tracking from './page';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchTrackingDashboard: vi.fn(), fetchTrackingFilterOptions: vi.fn(),
  fetchTrackingAnalysis: vi.fn(), fetchTrackingComparison: vi.fn(),
  syncTrackingData: vi.fn(), downloadTrackingExport: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({
    totals: { views: null, likes: null, comments: null, shares: null, engagement: null,
      clicks: 0, reels: 0, partial_metrics: [] },
    details: [], click_trend: [], platforms: [], products: [], campaigns: [], reels: [],
    has_data: false, semantics: '', generated_at: '2026-10-15T00:00:00Z', unrelated_observations: 0, accounts: [],
  });
  vi.mocked(api.fetchTrackingFilterOptions).mockResolvedValue({
    platforms: ['youtube'], products: [], campaigns: [], reels: [],
    distributions: [{ id: 'distribution-1', name: 'สินค้า · youtube' }],
  });
});

it('shows unavailable social counters and zero clicks without commerce claims', async () => {
  render(<Tracking />);
  await screen.findByText(/No tracking data matches/);
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
  expect(screen.queryByText('Orders')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'CSV' })[0]).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-15' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Start date must be before end date');
});

it('exports the compared periods even if draft dates change afterward', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({ ...dashboard, has_data: true });
  vi.mocked(api.fetchTrackingComparison).mockResolvedValue({
    a: { start: '2026-01-01', end: '2026-01-07', clicks: 100, complete: true },
    b: { start: '2026-01-08', end: '2026-01-14', clicks: 150, complete: true },
    difference: 50, percentage_change: 50, equal_duration: true, limitation: 'Lifetime social unavailable', coverage_start: '2025-12-01',
  });
  render(<Tracking />);
  await screen.findByText('Compare periods · Affiliate link clicks');
  const periods = { a_start: '2026-01-01', a_end: '2026-01-07', b_start: '2026-01-08', b_end: '2026-01-14' };
  for (const [key, value] of Object.entries(periods)) {
    fireEvent.change(screen.getByLabelText(key.replace('_', ' ')), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
  await screen.findByText('Change: 50 · 50%');
  fireEvent.change(screen.getByLabelText('a start'), { target: { value: '2026-02-01' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'CSV' })[0]);
  await waitFor(() => expect(api.downloadTrackingExport).toHaveBeenCalledWith('csv', periods));
});
