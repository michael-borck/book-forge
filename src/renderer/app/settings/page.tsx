import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

const providers = [
  { name: 'Groq', status: 'not-configured', models: ['Llama 3.3', 'Mixtral'] },
  { name: 'Claude', status: 'not-configured', models: ['Claude 3 Opus', 'Claude 3 Sonnet'] },
  { name: 'OpenAI', status: 'not-configured', models: ['GPT-4', 'GPT-3.5'] },
  { name: 'Gemini', status: 'not-configured', models: ['Gemini Pro'] },
  { name: 'Ollama', status: 'not-configured', models: ['Local models'] },
]

export default function SettingsPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure your AI providers and application preferences
        </p>
      </div>
      
      <div className="space-y-6">
        {/* API Providers Section */}
        <Card>
          <CardHeader>
            <CardTitle>AI Providers</CardTitle>
            <CardDescription>
              Configure your API keys and select models for book generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.map((provider, index) => (
              <div key={provider.name}>
                {index > 0 && <Separator />}
                <div className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-medium">{provider.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Models: {provider.models.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={provider.status === 'configured' ? 'default' : 'outline'}>
                        {provider.status}
                      </Badge>
                      <Button size="sm" variant="outline">
                        Configure
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>
              Application preferences and defaults
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Default Writing Style</label>
              <select className="mt-1 w-full rounded-md border px-3 py-2">
                <option>Educational</option>
                <option>Casual</option>
                <option>Professional</option>
                <option>Creative</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Default Book Length</label>
              <select className="mt-1 w-full rounded-md border px-3 py-2">
                <option>Short (5 chapters)</option>
                <option>Medium (10 chapters)</option>
                <option>Long (20+ chapters)</option>
              </select>
            </div>
            
            <div className="pt-4">
              <Button>Save Settings</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}