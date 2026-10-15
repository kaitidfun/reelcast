import pytest
from app.core.config import Settings
from app.services.facebook import FacebookProvider
from app.services.instagram import InstagramProvider
from app.services.base import ProviderError


def test_graph_urls_load_from_independent_environment_keys(monkeypatch):
    monkeypatch.setenv('FACEBOOK_GRAPH_API_BASE_URL', 'https://facebook.test/v1')
    monkeypatch.setenv('INSTAGRAM_GRAPH_API_BASE_URL', 'https://instagram.test/v2')
    monkeypatch.setenv('META_GRAPH_API_BASE_URL', 'https://legacy.test')
    settings = Settings(_env_file=None)
    assert settings.facebook_graph_api_base_url == 'https://facebook.test/v1'
    assert settings.instagram_graph_api_base_url == 'https://instagram.test/v2'


@pytest.mark.parametrize('configured,missing', [('facebook','instagram'),('instagram','facebook')])
def test_each_provider_requires_only_its_own_graph_url(configured, missing):
    settings = Settings(_env_file=None, facebook_graph_api_base_url='', instagram_graph_api_base_url='')
    setattr(settings, f'{configured}_graph_api_base_url', 'https://configured.test')
    clients = {'facebook': FacebookProvider(), 'instagram': InstagramProvider()}
    for client in clients.values():
        client.settings = lambda: settings
    clients[configured].require(f'{configured}_graph_api_base_url')
    with pytest.raises(ProviderError):
        clients[missing].require(f'{missing}_graph_api_base_url')
