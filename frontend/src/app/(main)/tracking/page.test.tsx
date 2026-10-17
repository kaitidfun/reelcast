import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    distributions: [{ id: 'distribution-1', name: 'สินค้า · youtube', platform: 'youtube', campaign_id: null, product_id: null, reel_id: 'reel-1' }],
  });
});

afterEach(() => vi.unstubAllGlobals());

it('shows analysis progress only on the Analyze button', async () => {
  let finish!: () => void;
  vi.mocked(api.fetchTrackingAnalysis).mockImplementationOnce(() => new Promise(resolve => {
    finish = () => resolve({ level: 'reel', metric: 'views', rows: [], semantics: '' });
  }));
  const { container } = render(<Tracking />);
  await screen.findByText('Tracking details');
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  const analyzing = screen.getByRole('button', { name: 'Analyzing…' });
  expect(analyzing).toBeDisabled();
  expect(analyzing.querySelector('.animate-spin')).not.toBeNull();
  expect(container.querySelectorAll('.animate-spin')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Sync Data' }).querySelector('.animate-spin')).toBeNull();
  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
});

it('animates only the selected export group and clears progress after failure', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({ ...dashboard, has_data: true });
  vi.mocked(api.fetchTrackingAnalysis).mockResolvedValue({ level: 'reel', metric: 'views', rows: [], semantics: '' });
  let rejectExport!: (error: Error) => void;
  vi.mocked(api.downloadTrackingExport).mockImplementationOnce(() => new Promise((_, reject) => { rejectExport = reject; }));
  const { container } = render(<Tracking />);
  await screen.findByText('Tracking details');
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  const ranking = screen.getByRole('heading', { name: 'Content ranking' }).closest('section')!;
  await within(ranking).findByRole('button', { name: 'CSV' });
  const details = screen.getByText('Tracking details').closest('section')!;
  fireEvent.click(within(details).getByRole('button', { name: 'CSV' }));
  expect(within(details).getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  const otherExport = within(ranking).getByRole('button', { name: 'CSV' });
  expect(otherExport).toBeDisabled();
  expect(otherExport.querySelector('.animate-spin')).toBeNull();
  expect(container.querySelectorAll('.animate-spin')).toHaveLength(1);
  await act(async () => rejectExport(new Error('Export unavailable')));
  expect(within(details).getByRole('button', { name: 'CSV' })).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Export unavailable');
});

it('limits all comparison dates to Bangkok today and blocks manually entered future dates', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Bangkok has reached January 15 while UTC is still January 14.
  vi.setSystemTime(new Date('2026-01-14T18:00:00Z'));
  try {
    render(<Tracking />);
    await screen.findByText('Tracking details');
    const dates = [['Start date', '2026-01-01'], ['End date', '2026-01-07'],
      ['Period B start date', '2026-01-08'], ['Period B end date', '2026-01-15']];
    for (const [label, value] of dates) {
      expect(screen.getByLabelText(label)).toHaveAttribute('max', '2026-01-15');
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(screen.getByRole('button', { name: 'Compare periods' })).toBeEnabled();
    for (const [label, value] of dates) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '2026-01-16' } });
      expect(screen.getByRole('button', { name: 'Compare periods' })).toBeDisabled();
      expect(screen.getByText('Dates cannot be later than today (Asia/Bangkok).')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
      expect(api.fetchTrackingComparison).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(screen.getByRole('button', { name: 'Compare periods' })).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});

it('shows unavailable social counters and zero clicks without commerce claims', async () => {
  render(<Tracking />);
  await screen.findByText(/No tracking data matches/);
  for (const title of ['Views', 'Likes', 'Comments', 'Shares']) {
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
  expect(within(chart).getByLabelText('Top platform')).toHaveTextContent('Facebook · 5');
  for (const [platform, total] of [['YouTube Shorts', '1'], ['Facebook', '5'], ['Instagram', '1'], ['TikTok', '0']]) {
    expect(within(within(chart).getByText(platform).parentElement!).getByText(total)).toBeInTheDocument();
  }
});

it('shows each social platform metric independently and preserves zero versus unavailable', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  const counters = { views: 99, likes: 8, comments: 2, shares: 5, engagement: 15, clicks: 0, partial_metrics: [], observed_at: null };
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({
    ...dashboard, has_data: true,
    platforms: [
      { ...counters, id: 'instagram', name: 'instagram', value: 99 },
      { ...counters, id: 'facebook', name: 'facebook', value: 99, likes: 0, comments: 0, shares: null },
    ],
  });
  render(<Tracking />);
  for (const [metric, total] of [['Likes', '8'], ['Comments', '2'], ['Shares', '5']]) {
    const chart = (await screen.findByRole('heading', { name: `${metric} by platform` })).closest('section')!;
    const platformValue = (name: string) => within(within(chart).getByText(name).parentElement!);
    expect(within(chart).getByLabelText('Top platform')).toHaveTextContent(`Instagram · ${total}`);
    expect(within(chart).getByLabelText('Top platform')).not.toHaveTextContent('Facebook');
    expect(platformValue('Instagram').getByText(total)).toBeInTheDocument();
    expect(platformValue('Facebook').getByText(metric === 'Shares' ? 'Unavailable' : '0')).toBeInTheDocument();
    expect(platformValue('TikTok').getByText('Unavailable')).toBeInTheDocument();
  }
  const views = screen.getByRole('heading', { name: 'View by platform' }).closest('section')!;
  const leaders = within(views).getByLabelText('Top platform');
  expect(leaders).toHaveTextContent('Instagram · 99');
  expect(leaders).toHaveTextContent('Facebook · 99');
  expect(leaders).not.toHaveTextContent('TikTok');
});

it('cascades distributed scope options and resets descendants when a parent changes', async () => {
  vi.mocked(api.fetchTrackingFilterOptions).mockResolvedValue({
    platforms: ['youtube', 'facebook'],
    campaigns: [{ id: 'c1', name: 'Campaign One' }, { id: 'c2', name: 'Campaign Two' }],
    products: [{ id: 'p1', name: 'Product One' }, { id: 'p2', name: 'Product Two' }],
    reels: [{ id: 'r1', name: 'Reel One' }, { id: 'r2', name: 'Reel Two' }],
    distributions: [
      { id: 'd1', name: '', platform: 'youtube', campaign_id: 'c1', product_id: 'p1', reel_id: 'r1' },
      { id: 'd2', name: '', platform: 'facebook', campaign_id: 'c2', product_id: 'p2', reel_id: 'r2' },
    ],
  });
  render(<Tracking />);
  await screen.findByText('Tracking details');
  async function choose(label: string, option: string) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: option }));
  }
  await choose('Platform', 'YouTube Shorts');
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Campaign' }), { key: 'Enter' });
  expect(await screen.findByRole('option', { name: 'Campaign One' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Campaign Two' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Campaign One' }));
  await choose('Product', 'Product One');
  await choose('Reel', 'Reel One');
  await choose('Campaign', 'All campaigns');
  expect(screen.getByRole('combobox', { name: 'Product' })).toHaveTextContent('All products');
  expect(screen.getByRole('combobox', { name: 'Reel' })).toHaveTextContent('All reels');
  await choose('Campaign', 'Campaign One');
  await choose('Product', 'Product One');
  await choose('Reel', 'Reel One');
  await choose('Product', 'All products');
  expect(screen.getByRole('combobox', { name: 'Reel' })).toHaveTextContent('All reels');
  await choose('Platform', 'Facebook');
  expect(screen.getByRole('combobox', { name: 'Campaign' })).toHaveTextContent('All campaigns');
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Campaign' }), { key: 'Enter' });
  expect(await screen.findByRole('option', { name: 'Campaign Two' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Campaign One' })).not.toBeInTheDocument();
});

it('blocks overlapping periods including a shared boundary day and permits adjacent periods', async () => {
  render(<Tracking />);
  await screen.findByText('Tracking details');
  for (const [label, value] of [['Start date', '2026-01-01'], ['End date', '2026-01-07'],
    ['Period B start date', '2026-01-07'], ['Period B end date', '2026-01-14']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  expect(screen.getByRole('alert')).toHaveTextContent('Period B must start after Period A ends');
  expect(screen.getByLabelText('Period B start date')).toHaveAttribute('min', '2026-01-08');
  expect(screen.getByRole('button', { name: 'Compare periods' })).toBeDisabled();
  expect(api.fetchTrackingComparison).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Period B start date'), { target: { value: '2026-01-08' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Compare periods' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Period B start date'), { target: { value: '2025-12-01' } });
  fireEvent.change(screen.getByLabelText('Period B end date'), { target: { value: '2025-12-07' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Period B must start after Period A ends');
  expect(screen.getByRole('button', { name: 'Compare periods' })).toBeDisabled();
});

it('requires end dates strictly after start dates for both periods', async () => {
  render(<Tracking />);
  await screen.findByText('Tracking details');
  for (const [label, value] of [['Start date', '2026-01-01'], ['End date', '2026-01-01'],
    ['Period B start date', '2026-01-08'], ['Period B end date', '2026-01-08']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  expect(screen.getByLabelText('End date')).toHaveAttribute('min', '2026-01-02');
  expect(screen.getByLabelText('Period B end date')).toHaveAttribute('min', '2026-01-09');
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Start date must be before end date');
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-07' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Period B start date must be before end date');
  expect(api.fetchTrackingComparison).not.toHaveBeenCalled();
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
  expect(await screen.findByLabelText('Click growth rate')).toHaveTextContent('+50%');
  const appliedFilters = { start: periods.a_start, end: periods.a_end, platform: 'youtube' };
  expect(api.fetchTrackingDashboard).toHaveBeenLastCalledWith({});
  expect(api.fetchTrackingDashboard).toHaveBeenCalledTimes(2);
  expect(api.fetchTrackingComparison).toHaveBeenCalledWith({ ...appliedFilters, ...periods });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-02-01' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'CSV' })[0]);
  await waitFor(() => expect(api.downloadTrackingExport).toHaveBeenCalledWith('csv', { ...appliedFilters, ...periods }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled());
  const comparisonCalls = vi.mocked(api.fetchTrackingComparison).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await waitFor(() => expect(api.fetchTrackingDashboard).toHaveBeenLastCalledWith({}));
  expect(api.fetchTrackingDashboard).toHaveBeenCalledTimes(2);
  for (const label of Object.values(labels)) expect(screen.getByLabelText(label)).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Platform' })).toHaveTextContent('All platforms');
  expect(screen.queryByLabelText('Click growth rate')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  expect(api.fetchTrackingComparison).toHaveBeenCalledTimes(comparisonCalls);
});

it('isolates comparison loading, errors, exports and reset from dashboard, ranking and pagination', async () => {
  const dashboard = await api.fetchTrackingDashboard();
  const details = Array.from({ length: 26 }, (_, index) => ({
    distribution_id: `distribution-${index}`, reel_name: `Kept reel ${index}`, platform: 'youtube',
    distribute_date: null, observed_at: null, views: 1, likes: 0, comments: 0, shares: null,
    engagement: 0, clicks: 0, partial_metrics: [],
  }));
  vi.mocked(api.fetchTrackingDashboard).mockResolvedValue({ ...dashboard, has_data: true, details });
  vi.mocked(api.fetchTrackingAnalysis).mockResolvedValue({ level: 'product', metric: 'clicks', semantics: '',
    rows: [{ ...dashboard.totals, id: 'kept', name: 'Kept product', value: 17, observed_at: null }],
  });
  let rejectComparison!: (error: Error) => void;
  vi.mocked(api.fetchTrackingComparison).mockImplementationOnce(() => new Promise((_, reject) => { rejectComparison = reject; }));
  render(<Tracking />);
  await screen.findByText('Tracking details');
  fireEvent.click(screen.getByRole('button', { name: 'Next tracking details page' }));
  for (const [label, option] of [['Ranking level', 'Product'], ['Ranking metric', 'Affiliate link clicks']]) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: option }));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  fireEvent.click(await screen.findByRole('button', { name: /#1 Kept product/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled());
  const ranking = screen.getByRole('heading', { name: 'Content ranking' }).closest('section')!;
  const detailSection = screen.getByText('Tracking details').closest('section')!;
  const rankingBefore = ranking.innerHTML;
  const detailsBefore = detailSection.innerHTML;
  const dashboardCalls = vi.mocked(api.fetchTrackingDashboard).mock.calls.length;
  const optionsCalls = vi.mocked(api.fetchTrackingFilterOptions).mock.calls.length;
  const comparisonPanel = screen.getByRole('region', { name: 'Compare periods' });
  const checkOtherSections = () => {
    expect(ranking.innerHTML).toBe(rankingBefore);
    expect(detailSection.innerHTML).toBe(detailsBefore);
    expect(api.fetchTrackingDashboard).toHaveBeenCalledTimes(dashboardCalls);
    expect(api.fetchTrackingFilterOptions).toHaveBeenCalledTimes(optionsCalls);
    expect(screen.getByRole('button', { name: 'Sync Data' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
    expect(within(detailSection).getByRole('button', { name: 'CSV' })).toBeEnabled();
  };
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Platform' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'YouTube Shorts' }));
  for (const [label, value] of [['Start date', '2026-01-01'], ['End date', '2026-01-07'],
    ['Period B start date', '2026-01-08'], ['Period B end date', '2026-01-14']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  checkOtherSections();
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  await within(comparisonPanel).findByText('Comparing periods…');
  checkOtherSections();
  await act(async () => rejectComparison(new Error('Comparison unavailable')));
  expect(within(comparisonPanel).getByRole('alert')).toHaveTextContent('Comparison unavailable');
  checkOtherSections();
  vi.mocked(api.fetchTrackingComparison).mockResolvedValue({
    a: { start: '2026-01-01', end: '2026-01-07', clicks: 10, complete: true },
    b: { start: '2026-01-08', end: '2026-01-14', clicks: 20, complete: true },
    difference: 10, percentage_change: 100, equal_duration: true, limitation: '', coverage_start: '2025-12-01',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(await screen.findByLabelText('Click growth rate')).toHaveTextContent('+100%');
  checkOtherSections();
  let rejectExport!: (error: Error) => void;
  vi.mocked(api.downloadTrackingExport).mockImplementationOnce(() => new Promise((_, reject) => { rejectExport = reject; }));
  fireEvent.click(within(screen.getByRole('region', { name: 'Period comparison results' })).getByRole('button', { name: 'CSV' }));
  checkOtherSections();
  await act(async () => rejectExport(new Error('Comparison export failed')));
  expect(within(comparisonPanel).getByRole('alert')).toHaveTextContent('Comparison export failed');
  checkOtherSections();
  fireEvent.click(within(comparisonPanel).getByRole('button', { name: 'Reset' }));
  expect(screen.queryByLabelText('Click growth rate')).not.toBeInTheDocument();
  checkOtherSections();
  fireEvent.click(within(detailSection).getByRole('button', { name: 'CSV' }));
  await waitFor(() => expect(api.downloadTrackingExport).toHaveBeenLastCalledWith('csv', {}));
});


it('shows a comparison overview with honest social observations and partial coverage', async () => {
  const social = { views: 100, likes: 0, comments: 2, shares: null, engagement: null, partial_metrics: ['shares', 'engagement'] };
  vi.mocked(api.fetchTrackingComparison).mockResolvedValue({
    a: { start: '2026-01-01', end: '2026-01-07', clicks: 1, complete: false, social },
    b: { start: '2026-01-08', end: '2026-01-15', clicks: 0, complete: false, social: { ...social, views: 150 } },
    difference: null, percentage_change: null, equal_duration: false, limitation: 'Incomplete link coverage', coverage_start: '2026-01-03',
  });
  render(<Tracking />);
  await screen.findByText('Tracking details');
  for (const [label, value] of [['Start date', '2026-01-01'], ['End date', '2026-01-07'],
    ['Period B start date', '2026-01-08'], ['Period B end date', '2026-01-15']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  const results = await screen.findByRole('region', { name: 'Period comparison results' });
  expect(within(results).getByRole('heading', { name: 'Period comparison · Overview' })).toBeInTheDocument();
  expect(within(results).getAllByText('Partial coverage')).toHaveLength(2);
  expect(within(results).getByText(/different durations/)).toBeInTheDocument();
  expect(within(results).getByLabelText('Click growth rate')).toHaveTextContent('-100%');
  expect(within(results).getByLabelText('Period B link clicks')).toHaveTextContent('0');
  const views = within(results).getByLabelText('Views observations');
  expect(views).toHaveTextContent('100');
  expect(views).toHaveTextContent('150');
  expect(within(views).getByText('Growth Rate')).toBeInTheDocument();
  expect(within(within(results).getByLabelText('Likes observations')).getAllByText('0')).toHaveLength(3);
  expect(within(within(results).getByLabelText('Shares observations')).getAllByText('0')).toHaveLength(3);
  expect(within(results).getByLabelText('Views growth')).toHaveTextContent('+50');
  expect(within(results).getByLabelText('Views growth rate')).toHaveTextContent('+50%');
  expect(within(results).getByLabelText('Shares growth')).toHaveTextContent('0');
  expect(within(results).getByLabelText('Shares growth rate')).toHaveTextContent('—');
  expect(within(results).getByText(/Unavailable counters are counted as 0/)).toBeInTheDocument();
  expect(within(results).getByText(/not activity earned within that period/)).toBeInTheDocument();
  expect(within(results).getByText(/One or both periods have partial coverage/)).toBeInTheDocument();
});

it.each([
  [10, 5, -5, -50, '-50%', '-5 clicks'],
  [10, 10, 0, 0, '0%', '0 clicks'],
  [0, 5, 5, null, '—', '+5 clicks'],
])('renders valid click changes for A=%s and B=%s', async (a, b, difference, percentage, percentText, differenceText) => {
  vi.mocked(api.fetchTrackingComparison).mockResolvedValue({
    a: { start: '2026-01-01', end: '2026-01-07', clicks: a as number, complete: true },
    b: { start: '2026-01-08', end: '2026-01-14', clicks: b as number, complete: true },
    difference: difference as number, percentage_change: percentage as number | null, equal_duration: true, limitation: '', coverage_start: '2025-12-01',
  });
  render(<Tracking />);
  await screen.findByText('Tracking details');
  for (const [label, value] of [['Start date', '2026-01-01'], ['End date', '2026-01-07'],
    ['Period B start date', '2026-01-08'], ['Period B end date', '2026-01-14']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compare periods' }));
  expect(await screen.findByLabelText('Click growth rate')).toHaveTextContent(String(percentText));
  expect(screen.getByLabelText('Click growth')).toHaveTextContent(String(differenceText));
  if (a === 0) expect(within(screen.getByRole('region', { name: 'Period comparison results' })).getAllByText(/Growth Rate undefined: Period A is 0/)[0]).toBeInTheDocument();
});

it('resets ranking results and choices without clearing comparison draft dates', async () => {
  vi.mocked(api.fetchTrackingAnalysis).mockResolvedValue({ level: 'product', metric: 'clicks', rows: [], semantics: '' });
  render(<Tracking />);
  const ranking = (await screen.findByRole('heading', { name: 'Content ranking' })).closest('section')!;
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
  for (const [label, option] of [['Ranking level', 'Product'], ['Ranking metric', 'Affiliate link clicks']]) {
    fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: option }));
  }
  fireEvent.click(within(ranking).getByRole('button', { name: 'Analyze' }));
  await within(ranking).findByText('No matching content.');
  await waitFor(() => expect(within(ranking).getByRole('button', { name: 'Reset' })).toBeEnabled());
  fireEvent.click(within(ranking).getByRole('button', { name: 'Reset' }));
  expect(screen.getByRole('combobox', { name: 'Ranking level' })).toHaveTextContent('Reel');
  expect(screen.getByRole('combobox', { name: 'Ranking metric' })).toHaveTextContent('Views');
  expect(within(ranking).queryByText('No matching content.')).not.toBeInTheDocument();
  expect(within(ranking).queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
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


it('validates both periods in the comparison filters before making a comparison request', async () => {
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
    distribute_date: null, observed_at: null, views: index, likes: 0, comments: 0, shares: null, engagement: 0, clicks: 0, partial_metrics: [],
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
  expect(screen.queryByText('Tracked reel 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next tracking details page' }));
  expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(screen.getByText('Tracked reel 51')).toBeInTheDocument();
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
