'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore, type ProviderUiStatus } from '@/lib/store'

const STATUS_META: Record<ProviderUiStatus, { label: string; variant: BadgeProps['variant'] }> = {
  ready: { label: 'Ready', variant: 'default' },
  configured: { label: 'Configured', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
  'not-configured': { label: 'Not configured', variant: 'outline' },
}

export default function SettingsPage() {
  const {
    providers,
    configured,
    models,
    current,
    loading,
    unavailable,
    error,
    refresh,
    configure,
    remove,
    setCurrent,
    loadModels,
    setModel,
    uiStatus,
  } = useSettingsStore()

  const [selectedId, setSelectedId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Default the selection to the current/first provider once loaded.
  useEffect(() => {
    if (!selectedId && providers.length) {
      setSelectedId(current ?? providers[0].id)
    }
  }, [providers, current, selectedId])

  const provider = providers.find((p) => p.id === selectedId)
  const status = provider ? uiStatus(provider.id) : 'not-configured'
  const isConfigured = provider ? Boolean(configured[provider.id]) : false
  const isReady = status === 'ready'

  // Load models once the selected provider is ready.
  useEffect(() => {
    if (provider && isReady && !models[provider.id]) {
      void loadModels(provider.id)
    }
  }, [provider, isReady, models, loadModels])

  // Reset the per-provider form fields when switching providers.
  useEffect(() => {
    setApiKey('')
    setEndpoint('')
    setMessage(null)
  }, [selectedId])

  async function handleSave() {
    if (!provider) return
    setBusy(true)
    setMessage(null)
    const config = {
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
    }
    const result = await configure(provider.id, config)
    setBusy(false)
    if (result.ok) {
      setApiKey('')
      setMessage({ ok: true, text: 'Saved and connected.' })
    } else {
      setMessage({ ok: false, text: result.message ?? 'Failed to configure provider.' })
    }
  }

  async function handleRemove() {
    if (!provider) return
    setBusy(true)
    await remove(provider.id)
    setBusy(false)
    setMessage(null)
  }

  const providerModels = provider ? (models[provider.id] ?? []) : []
  const selectedModel = provider ? (configured[provider.id]?.model ?? '') : ''

  const keyPlaceholder = isConfigured
    ? '•••••••• (leave blank to keep existing)'
    : provider?.envKeyAvailable
      ? 'Using environment key (paste to override)'
      : 'Enter your API key'

  const canSave =
    !busy &&
    (!provider?.requiresApiKey ||
      isConfigured ||
      provider?.envKeyAvailable ||
      apiKey.trim().length > 0)

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure your AI providers and application preferences
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI Providers</CardTitle>
            <CardDescription>
              Pick a provider, add its API key, and choose a model. Keys are encrypted and stored
              locally — they never leave your machine except to call the provider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {unavailable && (
              <p className="text-sm text-muted-foreground">
                Provider configuration is only available in the BookForge desktop app.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {loading && !providers.length && (
              <p className="text-sm text-muted-foreground">Loading providers…</p>
            )}

            {!unavailable && providers.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="provider">Provider</Label>
                  <select
                    id="provider"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {uiStatus(p.id) === 'ready' ? ' — ready' : ''}
                        {uiStatus(p.id) !== 'ready' && p.envKeyAvailable ? ' — env key' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {provider && (
                  <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{provider.name}</h3>
                        <p className="text-sm text-muted-foreground">{provider.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {current === provider.id && <Badge variant="outline">Current</Badge>}
                        <Badge variant={STATUS_META[status].variant}>
                          {STATUS_META[status].label}
                        </Badge>
                      </div>
                    </div>

                    {provider.envKeyAvailable && !isConfigured && (
                      <p className="text-sm text-muted-foreground">
                        An environment key was detected — just click <strong>Save &amp; test</strong>{' '}
                        to use it, or paste a key to override.
                      </p>
                    )}

                    {provider.requiresApiKey && (
                      <div className="space-y-1.5">
                        <Label htmlFor="apiKey">API key</Label>
                        <Input
                          id="apiKey"
                          type="password"
                          autoComplete="off"
                          placeholder={keyPlaceholder}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="endpoint">
                        Endpoint {provider.requiresApiKey ? '(optional)' : ''}
                      </Label>
                      <Input
                        id="endpoint"
                        type="text"
                        placeholder={provider.supportsLocalModels ? 'http://localhost:11434' : 'Default'}
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" disabled={!canSave} onClick={handleSave}>
                        {busy ? 'Saving…' : 'Save & test'}
                      </Button>
                      {isReady && current !== provider.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setCurrent(provider.id)}
                        >
                          Set as current
                        </Button>
                      )}
                      {isConfigured && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={handleRemove}>
                          Remove
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="model">Model</Label>
                      {isReady ? (
                        providerModels.length > 0 ? (
                          <select
                            id="model"
                            value={selectedModel}
                            onChange={(e) => setModel(provider.id, e.target.value)}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          >
                            <option value="" disabled>
                              Select a model…
                            </option>
                            {providerModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm text-muted-foreground">Loading models…</p>
                        )
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Save &amp; test the provider to choose a model.
                        </p>
                      )}
                    </div>

                    {message && (
                      <p className={`text-sm ${message.ok ? 'text-green-600' : 'text-destructive'}`}>
                        {message.text}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
