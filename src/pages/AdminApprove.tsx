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
  const [studentName, setStudentName] = useState<string | null>(null)
  const id = searchParams.get("id")

  useEffect(() => {
    const approveStudent = async () => {
      if (!id) {
        setError("No id provided in the URL")
        setLoading(false)
        return
      }

      try {
        // Update student approval status (no .single/.select)
        const { error: updateError } = await supabase
          .from("students")
          .update({ is_approved: true })
          .eq("id", id)

        if (updateError) throw updateError

        // Optionally fetch student's name after update
        const { data: studentRows, error: studentFetchError } = await supabase
          .from("students")
          .select("profile_id")
          .eq("id", id)

        if (!studentFetchError && studentRows && studentRows.length > 0) {
          const profileId = studentRows[0].profile_id

          if (profileId) {
            const { data: profileRows, error: profileError } = await supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", profileId)

            if (!profileError && profileRows && profileRows.length > 0) {
              const profile = profileRows[0]
              setStudentName(
                `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || null
              )
            }
          }
        }

        setSuccess(true)
      } catch (err: any) {
        setError(err.message || "An error occurred during approval")
      } finally {
        setLoading(false)
      }
    }

    approveStudent()
  }, [id])

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
              <p className="text-gray-600">
                Processing approval for student{" "}
                <span className="font-semibold">{id ?? "—"}</span>...
              </p>
            </div>
          )}

          {success && (
            <div className="py-8">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-800 mb-2">
                {studentName ? `Approved: ${studentName}` : "Student Approved!"}
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
