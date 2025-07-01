import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, FileCode, FileImage, Download } from 'lucide-react'

const exportFormats = [
  {
    format: 'Markdown',
    icon: FileCode,
    description: 'Clean, portable format compatible with Pandoc and other tools',
    fileExtension: '.md',
    available: true,
  },
  {
    format: 'HTML',
    icon: FileCode,
    description: 'Responsive web format with customizable themes',
    fileExtension: '.html',
    available: true,
  },
  {
    format: 'PDF',
    icon: FileImage,
    description: 'Professional format ready for printing or sharing',
    fileExtension: '.pdf',
    available: true,
  },
]

export default function ExportPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Export Books</h1>
        <p className="text-muted-foreground mt-2">
          Export your generated books in various formats
        </p>
      </div>
      
      <div className="grid gap-6">
        {/* Book Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Book</CardTitle>
            <CardDescription>
              Choose a book from your library to export
            </CardDescription>
          </CardHeader>
          <CardContent>
            <select className="w-full rounded-md border px-3 py-2">
              <option>Introduction to Machine Learning</option>
              <option>Web Development Best Practices</option>
            </select>
          </CardContent>
        </Card>
        
        {/* Export Formats */}
        <Card>
          <CardHeader>
            <CardTitle>Export Format</CardTitle>
            <CardDescription>
              Choose your preferred export format
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {exportFormats.map((format) => {
                const Icon = format.icon
                return (
                  <div
                    key={format.format}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <Icon className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">{format.format}</h3>
                        <p className="text-sm text-muted-foreground">
                          {format.description}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{format.fileExtension}</Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
        
        {/* Export Options */}
        <Card>
          <CardHeader>
            <CardTitle>Export Options</CardTitle>
            <CardDescription>
              Customize your export settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm">Include table of contents</span>
              </label>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="text-sm">Include metadata</span>
              </label>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" />
                <span className="text-sm">Include cover page</span>
              </label>
            </div>
            
            <div className="pt-4">
              <Button className="w-full" size="lg">
                <Download className="mr-2 h-4 w-4" />
                Export Book
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}