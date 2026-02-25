import { useEffect, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AdminApprove() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const approveStudent = async () => {
      const token = searchParams.get('token')
      
      if (!token) {
        setError('No approval token provided')
        setLoading(false)
        return
      }

      try {
        const { data, error: rpcError } = await supabase
          .rpc('approve_student_by_token', { token })

        if (rpcError) throw rpcError

        if (data?.success) {
          setSuccess(true)
        } else {
          setError(data?.message || 'Approval failed')
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred during approval')
      } finally {
        setLoading(false)
      }
    }

    approveStudent()
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full shadow-[var(--shadow-card)] border border-border">
        <CardHeader>
          <CardTitle className="text-center">
            Student Approval
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {loading && (
            <div className="py-8">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-purple-600 mb-4" />
              <p className="text-gray-600">Processing approval...</p>
            </div>
          )}

          {success && (
            <div className="py-8">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-800 mb-2">
                Student Approved!
              </h3>
              <p className="text-gray-600 mb-6">
                The student has been approved successfully and now has full access to the portal.
              </p>
              <Button asChild>
                <Link to="/admin">Go to Admin Dashboard</Link>
              </Button>
            </div>
          )}

          {error && (
            <div className="py-8">
              <XCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-red-800 mb-2">
                Approval Failed
              </h3>
              <p className="text-gray-600 mb-6">{error}</p>
              <Button asChild variant="outline">
                <Link to="/admin">Go to Admin Dashboard</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
