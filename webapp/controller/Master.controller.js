sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"sap/ui/core/Fragment",
	"../model/formatter",
	"sap/ui/core/format/DateFormat",
	'sap/m/MessageBox',
	"sap/ui/core/ListItem",
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, GroupHeaderListItem, Device, Fragment, formatter, 
			DateFormat,MessageBox,ListItem) {
	"use strict";

	var that;

	return BaseController.extend("poderosa.app.mantenimiento.controller.Master", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit : function () {

			that = this;
			/*
			$.ajax({
				url: "/services/userapi/attributes",
				async: false,
				success: function (data, status, xhr) {
					that._user = data;
				},
				error: function (status, xhr) {}
			});*/
			this.onloadCombos("CLASE");
			this.onloadCombos("PRIORIDAD");
			this.getListaAviso();
			// Control state model
			var oList = this.byId("list"),
				oViewModel = this._createViewModel(),
				// Put down master list's original value for busy indicator delay,
				// so it can be restored later on. Busy handling on the master list is
				// taken care of by the master list itself.
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();

			this._oGroupFunctions = {
				CompanyName: function (oContext) {
					var sCompanyName = oContext.getProperty("Customer/CompanyName");
					return {
						key: sCompanyName,
						text: sCompanyName
					};
				},

				OrderDate: function (oContext) {
					var oDate = oContext.getProperty("OrderDate"),
						iYear = oDate.getFullYear(),
						iMonth = oDate.getMonth() + 1,
						sMonthName = this._oMonthNameFormat.format(oDate);

					return {
						key: iYear + "-" + iMonth,
						text: this.getResourceBundle().getText("masterGroupTitleOrderedInPeriod", [sMonthName, iYear])
					};
				}.bind(this),

				ShippedDate: function (oContext) {
					var oDate = oContext.getProperty("ShippedDate");
					// Special handling needed because shipping date may be empty (=> not yet shipped).
					if (oDate != null) {
						var iYear = oDate.getFullYear(),
							iMonth = oDate.getMonth() + 1,
							sMonthName = this._oMonthNameFormat.format(oDate);

						return {
							key: iYear + "-" + iMonth,
							text: this.getResourceBundle().getText("masterGroupTitleShippedInPeriod", [sMonthName, iYear])
						};
					} else {
						return {
							key: 0,
							text: this.getResourceBundle().getText("masterGroupTitleNotShippedYet")
						};
					}
				}.bind(this)
			};
			this._oMonthNameFormat = DateFormat.getInstance({ pattern: "MMMM"});

			this._oList = oList;

			// keeps the filter and search state
			this._oListFilterState = {
				aFilter : [],
				aSearch : []
			};

			this.setModel(oViewModel, "masterView");
			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oList.attachEventOnce("updateFinished", function(){
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});

			this.getRouter().getRoute("master").attachPatternMatched(this._onMasterMatched, this);
			this.getRouter().attachBypassed(this.onBypassed, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * After list data is available, this handler method updates the
		 * master list counter
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished : function (oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter("total"));
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch : function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this._oListFilterState.aSearch = [new Filter("qmtxt", FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh : function () {
			this._oList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange : function (oEvent) {
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter("selected");

			// skip navigation when deselecting an item in multi selection mode
			if (!(oList.getMode() === "MultiSelect" && !bSelected)) {
				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
			}
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed : function () {
			this._oList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader : function (oGroup) {
			return new GroupHeaderListItem({
				title : oGroup.text,
				upperCase : false
			});
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */


		_createViewModel : function() {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				delay: 0,
				titleCount: 0,
				noDataText: this.getResourceBundle().getText("masterListNoDataText")
			});
		},

		_onMasterMatched :  function() {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("appView").setProperty("/layout", "OneColumn");
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail : function (oItem) {
			var bReplace = !Device.system.phone;
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			var avisoPath = oItem.getBindingContext("Aviso").getPath();
			var aviso = avisoPath.split("/").slice(-1).pop();
			this.getRouter().navTo("object", {
				aviso : aviso
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {int} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount : function (iTotalItems) {
			// only update the counter if the length is final
			if (this._oList.getBinding("items").isLengthFinal()) {
				this.getModel("masterView").setProperty("/titleCount", iTotalItems);
			}
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch : function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oViewModel = this.getModel("masterView");
			this._oList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		_updateFilterBar : function (sFilterBarText) {
			var oViewModel = this.getModel("masterView");
			oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 0));
			oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("masterFilterBarText", [sFilterBarText]));
		},

		onSort: function (oEvent) {
			//Ordenamiento de Avisos (Ascendente - descendente )
			this._bDescendingSort = !this._bDescendingSort;
			var oView = this.getView(),
				oTable = oView.byId("list"),
				oBinding = oTable.getBinding("items"),
				oSorter = new Sorter("qmnum", this._bDescendingSort);

			oBinding.sort(oSorter);
		},

		getListaAviso: function (){
			//Listado de Avisos//
			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");
			var ofilters = [];
			var data;
			
			sap.ui.core.BusyIndicator.show();
			//Consulta Back End
			oModel.read("/listarAvisoSet", {
				filters: ofilters,
				success: function (result) {

					if (result.results[0] !== undefined){
						data = JSON.parse(result.results[0].et_data);
						data.count = data.length;
						that.onInitAvisos(data);
						sap.ui.core.BusyIndicator.hide();
					}else{
						sap.ui.core.BusyIndicator.hide();
					}					
				},
				error: function (err) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error(JSON.parse(err.responseText).error.message.value);
				}
			});
		},

		onInitAvisos: function(dataCollection)
		{	//Creación de Modelo y asignación en vista//
			var oModel = new JSONModel(dataCollection);
			this.getView().setModel(oModel,"Aviso"); 
			this.getOwnerComponent().setModel(oModel,"Aviso");			
		},

		onClearData: function(){
			//Limpiar fields al cerrar Dialog// 
			that.getView().byId("fc_cboClaseAviso").setValue();
			that.getView().byId("fc_textoBrev").setValue();
			that.getView().byId("fc_textoBrev").setValue("");
			that.getView().byId("fc_filterEquipo").setValue("");
			that.getView().byId("fc_filterUbicacionT").setValue("");
			that.getView().byId("fc_filterGrupoP").setValue("");
			that.getView().byId("fc_filterpuestoT").setValue("");
			that.getView().byId("fc_descripcion").setValue("");
			that.getView().byId("fc_cboPrioridad").setValue("");
		},

		onOpenNewAviso : function (oEvent) {
			// Llamar Form Creación Aviso
			if (!this._pViewSettingsDialog) {
				this._pViewSettingsDialog = Fragment.load({
					id: this.getView().getId(),
					name: "poderosa.app.mantenimiento.view.NewAviso",
					controller: this
				}).then(function(oDialog){
					// connect dialog to the root view of this component (models, lifecycle)
					this.getView().addDependent(oDialog);
					oDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
					return oDialog;
				}.bind(this));
			}
			this._pViewSettingsDialog.then(function(oDialog) {
				oDialog.open();
			});
		},

		onEndAviso: function () {
			//Cerrar Dialog//
			that.onClearData();
			that.byId("IdCreateAviso").close()
		},

		onBusquedaSensitiva: function (valor, filter1, filter2, objeto, input2) {
			//Filtros de Búsqueda Sensitiva//

			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");

			var ofilters = [];
			var filter = new Filter({
				path: "i_value",
				operator: FilterOperator.EQ,
				value1: valor
			});
			ofilters.push(filter);

			if (filter1 !== "") {
				var filter = new Filter({
					path: "i_filter",
					operator: FilterOperator.EQ,
					value1: filter1
				});
				ofilters.push(filter);
			}

			if (filter2 !== "") {
				var filter = new Filter({
					path: "i_filter_2",
					operator: FilterOperator.EQ,
					value1: filter2
				});
				ofilters.push(filter);
			}

			var filter = new Filter({
				path: "i_object",
				operator: FilterOperator.EQ,
				value1: objeto
			});
			ofilters.push(filter);
			
			sap.input2 = input2;

			sap.ui.core.BusyIndicator.show();
			oModel.read("/filtrosSet", {
				filters: ofilters,
				success: function (result) {
					sap.input2.destroySuggestionItems();
					if ( result.results[0].et_data.length > 0 ) {
						for (var j = 0; j < JSON.parse(result.results[0].et_data).length; j++) {
							sap.input2.addSuggestionItem(new ListItem({
								key: JSON.parse(result.results[0].et_data)[j].VALUE,
								text: JSON.parse(result.results[0].et_data)[j].TEXTO,
								additionalText: JSON.parse(result.results[0].et_data)[j].VALUE
							}));
						}	
					}
					
					sap.ui.core.BusyIndicator.hide();
				},
				error: function (err) {
					sap.ui.core.BusyIndicator.hide();
				}
			});

		},

		onValidateFields: function (){
		//Validación de campos
			/*
			var ubicacionT = sap.ui.getCore().byId("fc_filterUbicacionT");
			var grupoP	   = sap.ui.getCore().byId("fc_filterGrupoP");
			
			if (ubicacionT.getValue() !== ""){
				grupoP.setEditable(false);
				grupoP.setValue("");
			}else{
				grupoP.setEditable(true);
				//grupoP.setValue("");
			}
			
			if (grupoP.getValue() !== ""){
				ubicacionT.setEditable(false);
				ubicacionT.setValue("");
			}else{
				ubicacionT.setEditable(true);
				//ubicacionT.setValue("");
			}*/
		},

		onLiveChange: function (oEvent) {
			//Consulta en Tiempo Real
			var campo = oEvent.getSource().data("campo");
			var valor = oEvent.getSource().getValue();
			var input2 = oEvent.getSource();

			switch (campo) {
			case "EQUNR":
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				break;
			case "BTPLN":
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				that.onValidateFields();
				break;
			case "INGRP":
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				that.onValidateFields();
				break;
			case 'ARBPL':
				that.onBusquedaSensitiva(valor, "", "", campo, input2);
				break;
			}
		},

		onloadCombos: function (object_value) {
			//Carga de ComboBox de Prioridades//
			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");
			var ofilters = [];

			var filter = new Filter({
				path: "i_object",
				operator: FilterOperator.EQ,
				value1: object_value
			});
			ofilters.push(filter);

			var data;
			var oDatModel;
			
			oModel.read("/combosSet", {
				filters: ofilters,
				success: function (result) {
					data = JSON.parse(result.results[0].et_data);
					oDatModel = new JSONModel(data);
					that.getView().setModel(oDatModel,object_value);
					sap.ui.getCore().setModel(data,object_value);
				},
				error: function (err) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error(JSON.parse(err.responseText).error.message.value);
				}
			});
		},

		onCreateAviso:function()
		{
			//Creación de Aviso//
			var oModel = new sap.ui.model.odata.v2.ODataModel("/sap/opu/odata/sap/ZGW_APP_MANTEN_ISP_SRV/");
			var ofilters = [];
			var avisoRow = {};
			var oData = {};
			
			//Verificar antes de enviar
			if (this.onValidate()){
				
				avisoRow.qmart = this.getView().byId("fc_cboClaseAviso").getSelectedKey();
				avisoRow.equnr = this.getView().byId("fc_Equipo").getFields()[0].getSelectedKey();
				avisoRow.qmtxt = this.getView().byId("fc_textoBrev").getValue();
				avisoRow.btpln = this.getView().byId("fc_filterUbicacionT").getSelectedKey();
				avisoRow.ingrp = this.getView().byId("fc_filterGrupoP").getSelectedKey();
				avisoRow.arbpl = this.getView().byId("fc_filterpuestoT").getSelectedKey();
				avisoRow.priok = this.getView().byId("fc_cboPrioridad").getSelectedKey();
				avisoRow.descrip = this.getView().byId("fc_descripcion").getValue();
				
				oData.is_aviso_c = JSON.stringify(avisoRow);
				
				sap.ui.core.BusyIndicator.show();
				
				oModel.create("/avisoSet", oData , {
					filters: ofilters,
					success: function (result) {
						sap.ui.core.BusyIndicator.hide();
						if (result.e_operacion === '001') {
							MessageBox.success(result.e_msg);	
							that.onEndAviso();
							that.getListaAviso();
						}else{
							MessageBox.error(result.e_msg);
							that.onEndAviso();
						}
						
						//oDatModel = new JSONModel(data);
						//this.getView().setModel(oDatModel,"avisos");
					},
					error: function (err) {
						sap.ui.core.BusyIndicator.hide();
						MessageBox.error(JSON.parse(err.responseText).error.message.value);
					}
				});
			}
		},

		onValidate: function(){
			
			var ok = true;
			
			if (this.getView().byId("fc_cboClaseAviso").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Clase de Aviso");
			}else if (this.getView().byId("fc_textoBrev").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Texto breve");
			}/*else if (this.getView().byId("fc_filterEquipo").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Equipo");
			}else if (this.getView().byId("fc_filterUbicacionT").getValue() === "" && 
					  this.getView().byId("fc_filterUbicacionT").getEditable() === true ){
				ok = false;
				MessageBox.error("Debe Ingresar Ubicación Técnica");
			}
			else if (sap.ui.getCore().byId("fc_filterGrupoP").getValue() === "" &&
					  sap.ui.getCore().byId("fc_filterGrupoP").getEditable() === true ){
				ok = false;
				MessageBox.error("Debe Ingresar Especialidad");
			}else if (sap.ui.getCore().byId("fc_filterpuestoT").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Planta");
			}*/
			else if (this.getView().byId("fc_cboPrioridad").getValue() === ""){
				ok = false;
				MessageBox.error("Debe Ingresar Prioridad");
			}
			
			return ok;
		}


	});
});