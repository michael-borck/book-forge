'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useImageSettingsStore } from '@/lib/imageSettingsStore'

export function ImageProviderSettings() {
  const {
    providers,
    configured,
    current,
    loading,
    error,
    refresh,
    configure,
    setCurrent,
    remove,
  } = useImageSettingsStore()

  const [selectedId, setSelectedId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [size, setSize] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedId && providers.length) {
      setSelectedId(current ?? providers[0].id)
    }
  }, [providers, current, selectedId])

  const provider = providers.find((candidate) => candidate.id === selectedId)
  const saved = provider ? configured[provider.id] : undefined

  useEffect(() => {
    setApiKey('')
    setBaseUrl(saved?.baseUrl ?? '')
    setModel(saved?.model ?? '')
    setSize(saved?.size ?? '')
    setMessage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleSave() {
    if (!provider) return
    setBusy(true)
    setMessage(null)
    const result = await configure(provider.id, {
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(size.trim() ? { size: size.trim() } : {}),
    })
    setBusy(false)
    if (result.ok) {
      setApiKey('')
      setMessage({ ok: true, text: 'Saved. Select it as current to generate artwork.' })
    } else {
      setMessage({ ok: false, text: result.message ?? 'Failed to configure image provider.' })
    }
  }

  const canSave =
    !busy &&
    Boolean(provider) &&
    (!provider?.requiresApiKey || Boolean(saved?.hasApiKey) || apiKey.trim().length > 0) &&
    (!provider?.requiresBaseUrl || Boolean(baseUrl.trim())) &&
    (provider?.id !== 'openai-compatible' || Boolean(model.trim()))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Image Providers</CardTitle>
        <CardDescription>
          Illustrations use their own provider. Keys are encrypted locally and never leave your
          machine except to call the provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && !providers.length && (
          <p className="text-sm text-muted-foreground">Loading image providers…</p>
        )}

        {providers.length > 0 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="image-provider">Provider</Label>
              <select
                id="image-provider"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {providers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                    {configured[candidate.id] ? ' — configured' : ''}
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
                    <Badge variant={saved ? 'secondary' : 'outline'}>
                      {saved ? 'Configured' : 'Not configured'}
                    </Badge>
                  </div>
                </div>

                {(provider.requiresApiKey || provider.id === 'openai' || provider.id === 'gemini') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="image-key">API key</Label>
                    <Input
                      id="image-key"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={
                        saved?.hasApiKey
                          ? '•••••••• (leave blank to keep existing)'
                          : 'Enter your API key'
                      }
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="image-base">
                    Base URL {provider.requiresBaseUrl ? '(required)' : '(optional)'}
                  </Label>
                  <Input
                    id="image-base"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder={
                      provider.id === 'openai-compatible'
                        ? 'http://localhost:8080/v1'
                        : provider.id === 'swarmui'
                          ? 'https://swarmui.example.org'
                          : 'Default'
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="image-model">Model</Label>
                  <Input
                    id="image-model"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={provider.defaultModel || 'Required for this provider'}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="image-size">Default size / aspect</Label>
                  <select
                    id="image-size"
                    value={size}
                    onChange={(event) => setSize(event.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Provider default ({provider.defaultSize})</option>
                    {provider.sizes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={!canSave} onClick={handleSave}>
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                  {saved && current !== provider.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void setCurrent(provider.id)}
                    >
                      Set as current
                    </Button>
                  )}
                  {saved && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void remove(provider.id)}
                    >
                      Remove
                    </Button>
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
  )
}
