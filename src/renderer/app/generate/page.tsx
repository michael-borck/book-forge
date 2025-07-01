import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function GeneratePage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Generate New Book</h1>
        <p className="text-muted-foreground mt-2">
          Use AI to create your next book from a simple prompt
        </p>
      </div>
      
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Book Details</CardTitle>
            <CardDescription>
              Provide information about the book you want to generate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div>
                <label className="text-sm font-medium">Book Topic</label>
                <input
                  type="text"
                  placeholder="e.g., Introduction to Machine Learning"
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Style</label>
                  <select className="mt-1 w-full rounded-md border px-3 py-2">
                    <option>Educational</option>
                    <option>Casual</option>
                    <option>Professional</option>
                    <option>Creative</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Length</label>
                  <select className="mt-1 w-full rounded-md border px-3 py-2">
                    <option>Short (5 chapters)</option>
                    <option>Medium (10 chapters)</option>
                    <option>Long (20+ chapters)</option>
                  </select>
                </div>
              </div>
              
              <Button className="w-full" size="lg">
                Generate Book
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}