import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Tracking from './page';
import * as api from '@/lib/api';
import * as platforms from '@/lib/platforms';

vi.mock('@/lib/api', () => ({
  fetchTrackingDashboard: vi.fn(), fetchTrackingFilterOptions: vi.fn(),
  fetchTrackingAnalysis: vi.fn(), fetchTrackingComparison: vi.fn(),
  syncTrackingData: vi.fn(), downloadTrackingExport: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
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

afterEach(() => vi.unstubAllGlobals());

it('shows unavailable social counters and zero clicks without commerce claims', async () => {
  render(<Tracking />);
  await screen.findByText(/No tracking data matches/);
  for (const title of ['Views', 'Engagement']) {
    expect(within(screen.getByText(title, { selector: 'p' }).closest('section')!).getByText('Unavailable')).toBeInTheDocument();
  }
  expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
  expect(screen.queryByText('Orders')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'CSV' })[0]).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-15' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Start date must be before end date');
});

it('shows click totals by platform across all days, including zero clicks', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({
    ...dashboard,
    has_data: true,
    click_trend: [
      { date: '2026-10-14', clicks: 3, youtube: 1, facebook: 2, instagram: 0, tiktok: 0 },
      { date: '2026-10-15', clicks: 4, youtube: 0, facebook: 3, instagram: 1, tiktok: 0 },
    ],
  });
  render(<Tracking />);
  const chart = (await screen.findByRole('heading', { name: 'Affiliate link clicks by platform' })).closest('section')!;
  expect(within(chart).getByLabelText('Click reporting dates')).toHaveTextContent('14 Oct 2026 – 15 Oct 2026');
  for (const [platform, total] of [['YouTube Shorts', '1'], ['Facebook', '5'], ['Instagram', '1'], ['TikTok', '0']]) {
    expect(within(within(chart).getByText(platform).parentElement!).getByText(total)).toBeInTheDocument();
  }
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
  await screen.findByText('Tracking details');
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Platform' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'YouTube Shorts' }));
  const periods = { a_start: '2026-01-01', a_end: '2026-01-07', b_start: '2026-01-08', b_end: '2026-01-14' };
  const labels = { a_start: 'Start date', a_end: 'End date', b_start: 'Period B start date', b_end: 'Period B end date' };
  for (const [key, value] of Object.entries(periods)) {
    fireEvent.change(screen.getByLabelText(labels[key as keyof typeof labels]), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  await screen.findByText('Change: 50 · 50%');
  const appliedFilters = { start: periods.a_start, end: periods.a_end, platform: 'youtube' };
  expect(api.fetchTrackingDashboard).toHaveBeenCalledWith(appliedFilters);
  expect(api.fetchTrackingComparison).toHaveBeenCalledWith({ ...appliedFilters, ...periods });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-02-01' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'CSV' })[0]);
  await waitFor(() => expect(api.downloadTrackingExport).toHaveBeenCalledWith('csv', { ...appliedFilters, ...periods }));
});


it('offers reauthorization for expired tokens through the existing connection flow', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({ ...dashboard, accounts: [{
    id: 'youtube-account', platform: 'youtube', last_synced_at: null,
    error: 'youtube: token refresh failed; reconnect this platform in Settings',
  }] });
  const reconnect = vi.spyOn(platforms, 'connectSocialPlatform').mockImplementation(() => {});
  render(<Tracking />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reconnect YouTube Shorts' }));
  expect(reconnect).toHaveBeenCalledWith('youtube', '/tracking');
  expect(screen.getByRole('alert')).not.toHaveTextContent('youtube: youtube:');
  reconnect.mockRestore();
});


it('validates both periods in the shared filters before making a comparison request', async () => {
  render(<Tracking />);
  await screen.findByText(/No tracking data matches/);
  expect(screen.getByLabelText('Period B start date')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Compare periods' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Select start and end dates for both periods');
  expect(api.fetchTrackingComparison).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-07' } });
  fireEvent.change(screen.getByLabelText('Period B start date'), { target: { value: '2026-01-14' } });
  fireEvent.change(screen.getByLabelText('Period B end date'), { target: { value: '2026-01-08' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Period B start date must be before end date');
  expect(api.fetchTrackingComparison).not.toHaveBeenCalled();
});

it('paginates tracking details by 25, exports the full scope, and resets after refresh', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  const details = Array.from({ length: 51 }, (_, index) => ({
    distribution_id: `distribution-${index + 1}`, reel_name: `Tracked reel ${index + 1}`, platform: 'youtube',
    observed_at: null, views: index, likes: 0, comments: 0, shares: null, engagement: 0, clicks: 0, partial_metrics: [],
  }));
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({ ...dashboard, has_data: true, details });
  render(<Tracking />);
  await screen.findByText('Showing 1–25 of 51 · 25 rows per page');
  const table = screen.getByRole('table');
  expect(table.querySelectorAll('tbody tr')).toHaveLength(25);
  expect(screen.getByRole('button', { name: 'Previous tracking details page' })).toBeDisabled();
  const requestCount = vi.mocked(api.fetchTrackingDashboard).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Next tracking details page' }));
  expect(screen.getByText('Showing 26–50 of 51 · 25 rows per page')).toBeInTheDocument();
  expect(screen.queryByText('Tracked reel 1 · youtube')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next tracking details page' }));
  expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(screen.getByText('Tracked reel 51 · youtube')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next tracking details page' })).toBeDisabled();
  expect(api.fetchTrackingDashboard).toHaveBeenCalledTimes(requestCount);
  fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
  await waitFor(() => expect(api.downloadTrackingExport).toHaveBeenCalledWith('csv', {}));
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({ ...dashboard, has_data: true, details: details.slice(0, 26) });
  vi.mocked(api.syncTrackingData).mockResolvedValue({ social_metrics: 0, accounts: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Sync Data' }));
  await screen.findByText('Showing 1–25 of 26 · 25 rows per page');
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous tracking details page' })).toBeDisabled();
});
