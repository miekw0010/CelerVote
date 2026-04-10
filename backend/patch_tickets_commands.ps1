# Run this from: C:\Users\rtwen\Desktop\evote\backend

# 1. Make buyer nullable in models.py
(Get-Content "apps\tickets\models.py") `
  -replace 'buyer\s*=\s*models\.ForeignKey\(([^,]+),\s*on_delete=([^,\)]+)\)', `
           'buyer = models.ForeignKey($1, on_delete=$2, null=True, blank=True)' `
  | Set-Content "apps\tickets\models.py"

Write-Host "models.py patched"

# 2. Make InitiateTicketPaymentView allow guests
$views = Get-Content "apps\tickets\views.py" -Raw

$views = $views -replace `
  'class InitiateTicketPaymentView\(APIView\):\r?\n    permission_classes = \[IsAuthenticated\]', `
  "class InitiateTicketPaymentView(APIView):`n    permission_classes     = [AllowAny]`n    authentication_classes = []"

$views = $views -replace `
  'class VerifyTicketPaymentView\(APIView\):\r?\n    permission_classes = \[IsAuthenticated\]', `
  "class VerifyTicketPaymentView(APIView):`n    permission_classes     = [AllowAny]`n    authentication_classes = []"

$views = $views -replace `
  'user        = request\.user,', `
  'user        = request.user if request.user.is_authenticated else None,'

$views | Set-Content "apps\tickets\views.py"
Write-Host "views.py patched"

# 3. Make services.py handle user=None
$services = Get-Content "apps\tickets\services.py" -Raw

$services = $services -replace `
  'buyer       = user,', `
  'buyer       = user if user and getattr(user, "is_authenticated", False) else None,'

$services | Set-Content "apps\tickets\services.py"
Write-Host "services.py patched"

Write-Host "`nAll done! Now run:"
Write-Host "  python manage.py makemigrations tickets"
Write-Host "  python manage.py migrate"
