from django.contrib import admin
from .models import Employee

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'role', 'department', 'is_active', 'admission_date')
    search_fields = ('full_name', 'email')
    list_filter = ('role', 'department', 'is_active')