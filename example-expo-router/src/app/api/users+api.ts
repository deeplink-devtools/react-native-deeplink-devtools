/**
 * API route — served at /api/users with server output; never a navigable screen.
 */
export function GET() {
  return Response.json({ users: [{ id: '42', name: 'Ada' }] });
}
