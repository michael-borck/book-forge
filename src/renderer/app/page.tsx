import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function HomePage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold">Welcome to BookForge</CardTitle>
          <CardDescription className="text-lg">
            Generate complete books using AI, right from your desktop
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <Button size="lg" className="w-full max-w-sm">
            Create New Book
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Get started by configuring your AI provider in Settings
          </p>
        </CardContent>
      </Card>
    </div>
  )
}