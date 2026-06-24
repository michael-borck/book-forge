'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore, type ProviderUiStatus } from '@/lib/store'
import type { ProviderInfo } from '@/lib/api'

const STATUS_META: Record<ProviderUiStatus, { label: string; variant: BadgeProps['variant'] }> = {
  ready: { label: 'Ready', variant: 'default' },
  configured: { label: 'Configured', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
  'not-configured': { label: 'Not configured', variant: 'outline' },
}

function ProviderRow({ provider }: { provider: ProviderInfo }) {
  const { configured, current, uiStatus, configure, remove, setCurrent } = useSettingsStore()
  const status = uiStatus(provider.id)
  const isConfigured = Boolean(configured[provider.id])

  const [open, setOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSave() {
    setBusy(true)
    setMessage(null)
    const config = provider.requiresApiKey
      ? { apiKey: apiKey.trim(), ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}) }
      : { ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}) }
    const result = await configure(provider.id, config)
    setBusy(false)
    if (result.ok) {
      setApiKey('')
      setMessage({ ok: true, text: 'Saved and connected.' })
      setOpen(false)
    } else {
      setMessage({ ok: false, text: result.message ?? 'Failed to configure provider.' })
    }
  }

  async function handleRemove() {
    setBusy(true)
    await remove(provider.id)
    setBusy(false)
    setMessage(null)
  }

  const meta = STATUS_META[status]

  return (
    <div className="py-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{provider.name}</h3>
            {current === provider.id && <Badge variant="outline">Current</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{provider.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          {status === 'ready' && current !== provider.id && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCurrent(provider.id)}>
              Use
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : isConfigured ? 'Edit' : 'Configure'}
          </Button>
          {isConfigured && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={handleRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-md border bg-muted/30 p-4">
          {provider.requiresApiKey && (
            <div className="space-y-1.5">
              <Label htmlFor={`${provider.id}-key`}>API key</Label>
              <Input
                id={`${provider.id}-key`}
                type="password"
                autoComplete="off"
                placeholder={isConfigured ? '•••••••• (leave blank to keep existing)' : 'Enter your API key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${provider.id}-endpoint`}>
              Endpoint {provider.requiresApiKey ? '(optional)' : ''}
            </Label>
            <Input
              id={`${provider.id}-endpoint`}
              type="text"
              placeholder={provider.supportsLocalModels ? 'http://localhost:11434' : 'Default'}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              disabled={busy || (provider.requiresApiKey && !isConfigured && !apiKey.trim())}
              onClick={handleSave}
            >
              {busy ? 'Saving…' : 'Save & test'}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-2 text-sm ${message.ok ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { providers, loading, unavailable, error, refresh } = useSettingsStore()

  useEffect(() => {
    void refresh()
  }, [refresh])

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
              Configure your API keys and select models for book generation. Keys are encrypted and
              stored locally — they never leave your machine except to call the provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unavailable && (
              <p className="text-sm text-muted-foreground">
                Provider configuration is only available in the BookForge desktop app.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {loading && !providers.length && (
              <p className="text-sm text-muted-foreground">Loading providers…</p>
            )}
            {!unavailable &&
              providers.map((provider, index) => (
                <div key={provider.id}>
                  {index > 0 && <Separator />}
                  <ProviderRow provider={provider} />
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
