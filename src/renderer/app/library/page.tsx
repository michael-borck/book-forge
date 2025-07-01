import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Clock, FileText } from 'lucide-react'

// Mock data for demonstration
const books = [
  {
    id: 1,
    title: 'Introduction to Machine Learning',
    description: 'A comprehensive guide to ML fundamentals',
    createdAt: '2024-01-15',
    chapters: 12,
    status: 'completed',
  },
  {
    id: 2,
    title: 'Web Development Best Practices',
    description: 'Modern techniques for building web applications',
    createdAt: '2024-01-10',
    chapters: 8,
    status: 'in-progress',
  },
]

export default function LibraryPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">My Library</h1>
        <p className="text-muted-foreground mt-2">
          View and manage your generated books
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <Card key={book.id} className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <BookOpen className="h-8 w-8 text-primary" />
                <Badge variant={book.status === 'completed' ? 'default' : 'secondary'}>
                  {book.status}
                </Badge>
              </div>
              <CardTitle className="mt-4">{book.title}</CardTitle>
              <CardDescription>{book.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span>{book.chapters} chapters</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>{book.createdAt}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {books.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No books yet. Generate your first book!</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}