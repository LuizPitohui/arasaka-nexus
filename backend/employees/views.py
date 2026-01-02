from rest_framework import viewsets, status
from rest_framework.response import Response
from .models import Employee
from .serializers import EmployeeSerializer

class EmployeeViewSet(viewsets.ModelViewSet):
    # REGRA: Só mostra quem está ativo na lista padrão
    queryset = Employee.objects.filter(is_active=True).order_by('-admission_date')
    serializer_class = EmployeeSerializer

    # Sobrescreve o comando DELETE padrão
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Em vez de instance.delete(), fazemos isso:
        instance.is_active = False
        instance.save()
        
        return Response(status=status.HTTP_204_NO_CONTENT)