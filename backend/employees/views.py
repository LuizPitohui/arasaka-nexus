from rest_framework import viewsets, status, filters
from rest_framework.permissions import IsAuthenticated  # <--- IMPORTAR ISTO
from rest_framework.response import Response
from .models import Employee
from .serializers import EmployeeSerializer

class EmployeeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]  # <--- A LINHA QUE TRANCA O SISTEMA
    
    queryset = Employee.objects.filter(is_active=True).order_by('-admission_date')
    serializer_class = EmployeeSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['full_name', 'email', 'department', 'role']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)